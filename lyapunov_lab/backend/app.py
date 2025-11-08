import pickle
import warnings
import networkx as nx
from sklearn.preprocessing import StandardScaler
from bayes_opt import BayesianOptimization

warnings.filterwarnings("ignore")
import asyncio
import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# PySINDy (with proper error handling)
try:
    import pysindy as ps

    HAS_PYSINDY = True
except Exception:
    HAS_PYSINDY = False

app = FastAPI(
    title="Lyapunov Backend",
    description="APIs and streaming endpoints with SINDy",
    version="0.4.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

# CONFIGURATION
UDP_IP = "0.0.0.0"
UDP_PORT = 5005
SLEEP_TIME = 0.01

data_buffer: List[List[Dict[str, float]]] = []
clients: set[WebSocket] = set()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# TYPES
ChannelMap = Dict[str, float]
SystemParameters = Dict[str, float]


class InitialState(BaseModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


class Recording(BaseModel):
    id: str
    name: str
    timestamp: float
    duration: float
    data: List[ChannelMap]
    parameters: Optional[SystemParameters] = None
    initialState: Optional[InitialState] = None


class Axes(BaseModel):
    xKey: str = "x"
    yKey: str = "y"
    zKey: str = "z"


class SindyTrainRequest(BaseModel):
    recording: Recording
    axes: Axes


class FeatureInfo(BaseModel):
    name: str
    coefficient: float
    active: bool


class Metrics(BaseModel):
    mse: float
    r2: float
    sparsity: float
    activeFeatures: Optional[int] = None
    totalFeatures: Optional[int] = None


class SindyTrainResponse(BaseModel):
    runId: str
    metrics: Metrics
    equations: List[str]
    prediction: List[Dict[str, float]]
    features: Optional[List[List[FeatureInfo]]] = None


RUNS: Dict[str, SindyTrainResponse] = {}


# UDP SERVER
class UDPServerProtocol:
    def connection_made(self, transport):
        self.transport = transport
        print(f"Listening for UDP on {UDP_IP}:{UDP_PORT}")

    def datagram_received(self, data, addr):
        try:
            msg = data.decode().strip()
            parsed = json.loads(msg)
        except Exception as e:
            print(f"Invalid UDP packet: {e}")
            return

        if not isinstance(parsed, list):
            return

        if len(data_buffer) > 1:
            data_buffer.pop(0)
        data_buffer.append(parsed)


@app.on_event("startup")
async def start_udp_listener():
    loop = asyncio.get_running_loop()
    await loop.create_datagram_endpoint(
        lambda: UDPServerProtocol(),
        local_addr=(UDP_IP, UDP_PORT),
    )
    print(f"UDP listener started on {UDP_IP}:{UDP_PORT}")


# WEBSOCKET
@app.websocket("/api/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    print(f"WebSocket client connected ({len(clients)} total)")

    try:
        while True:
            if data_buffer:
                latest = data_buffer[-1]
                message = {"samples": latest, "timestamp": time.time()}
                await websocket.send_text(json.dumps(message))
            await asyncio.sleep(SLEEP_TIME)
    except Exception:
        print("WebSocket client disconnected")
    finally:
        clients.discard(websocket)


@app.get("/api/health")
def health():
    return {"status": "ok", "sindy": HAS_PYSINDY}


# SINDY HELPERS
def _extract_xyz_t(rec: Recording, axes: Axes) -> Tuple[np.ndarray, np.ndarray]:
    """Extract X (N,3) and t (N,) from recording"""
    N = len(rec.data)
    if N < 5:
        raise HTTPException(status_code=400, detail="Need at least 5 samples for SINDy")

    x = np.array([float(rec.data[i].get(axes.xKey, 0.0)) for i in range(N)])
    y = np.array([float(rec.data[i].get(axes.yKey, 0.0)) for i in range(N)])
    z = np.array([float(rec.data[i].get(axes.zKey, 0.0)) for i in range(N)])
    X = np.vstack([x, y, z]).T

    # Try to find time
    for k in ("t", "time", "timestamp", "T"):
        vals = [rec.data[i].get(k) for i in range(N)]
        if all(v is not None for v in vals):
            t_arr = np.asarray(vals, dtype=float)
            # Ensure monotonic
            if np.all(np.diff(t_arr) > 0):
                return X, t_arr

    # Uniform timeline
    dt = rec.duration / max(N - 1, 1) if rec.duration and rec.duration > 0 else 0.01
    t = np.linspace(0.0, dt * (N - 1), N, dtype=float)
    return X, t


def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """Compute MSE and R²"""
    n = min(len(y_true), len(y_pred))
    y_true = y_true[:n]
    y_pred = y_pred[:n]
    resid = y_true - y_pred
    mse = float(np.mean(resid**2))
    ss_res = float(np.sum(resid**2))
    ss_tot = float(np.sum((y_true - np.mean(y_true, axis=0)) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0
    return {"mse": mse, "r2": r2}


def _extract_features_from_model(
    model: "ps.SINDy",
) -> Tuple[List[str], float, List[List[FeatureInfo]]]:
    """
    Extract equations, sparsity, and per-equation feature info
    Returns: (equations_list, sparsity_ratio, features_per_equation)
    """
    try:
        # Get feature names from library
        feature_names = model.get_feature_names()
    except Exception:
        feature_names = []

    # Get coefficients (shape: n_features x n_targets)
    try:
        coeffs = model.coefficients()  # shape (n_features, n_targets=3)
    except Exception:
        coeffs = np.array([])

    # Calculate sparsity
    if coeffs.size > 0:
        sparsity = float(np.mean(np.abs(coeffs) < 1e-10))
    else:
        sparsity = 0.0

    # Extract equations
    try:
        eqs = model.equations(precision=6)
        if isinstance(eqs, list):
            pass
        elif isinstance(eqs, str):
            eqs = [line.strip() for line in eqs.split("\n") if line.strip()]
        else:
            eqs = []
    except Exception:
        eqs = []

    # Replace x0,x1,x2 with x,y,z
    eqs = [e.replace("x0", "x").replace("x1", "y").replace("x2", "z") for e in eqs]

    # Build feature matrix
    features_per_eq: List[List[FeatureInfo]] = []
    if coeffs.size > 0 and len(feature_names) > 0:
        n_features, n_targets = coeffs.shape
        for target_idx in range(min(n_targets, 3)):
            eq_features = []
            for feat_idx in range(n_features):
                coef_val = coeffs[feat_idx, target_idx]
                feat_name = (
                    feature_names[feat_idx]
                    .replace("x0", "x")
                    .replace("x1", "y")
                    .replace("x2", "z")
                )
                is_active = abs(coef_val) > 1e-10
                eq_features.append(
                    FeatureInfo(
                        name=feat_name, coefficient=float(coef_val), active=is_active
                    )
                )
            features_per_eq.append(eq_features)

    return eqs, sparsity, features_per_eq


def _fallback_linear_fit(
    X: np.ndarray, t: np.ndarray
) -> Tuple[np.ndarray, List[str], float, List[List[FeatureInfo]]]:
    """Baseline: dX/dt = X @ B"""
    dXdt = np.gradient(X, t, axis=0)
    B, *_ = np.linalg.lstsq(X, dXdt, rcond=None)

    # Simulate
    X_sim = np.zeros_like(X)
    X_sim[0] = X[0]
    for i in range(1, len(X)):
        dt_step = t[i] - t[i - 1]
        X_sim[i] = X_sim[i - 1] + X_sim[i - 1] @ B * dt_step

    vars_ = ["x", "y", "z"]
    eqs = []
    for j, v in enumerate(vars_):
        coeffs = B[:, j]
        terms = [f"{coeffs[k]:+0.6f}*{vars_[k]}" for k in range(3)]
        eqs.append(f"d{v}/dt = " + " ".join(terms))

    sparsity = float(np.mean(np.abs(B) < 1e-8))

    # Build feature matrix
    features_per_eq = []
    for j in range(3):
        eq_features = []
        for k in range(3):
            coef = B[k, j]
            eq_features.append(
                FeatureInfo(
                    name=vars_[k],
                    coefficient=float(coef),
                    active=abs(coef) > 1e-8,
                )
            )
        features_per_eq.append(eq_features)

    return X_sim, eqs, sparsity, features_per_eq


def _align_prediction(pred: np.ndarray, t: np.ndarray) -> List[Dict[str, float]]:
    """Convert (N,3) array to list of dicts with x,y,z,t"""
    out: List[Dict[str, float]] = []
    for i in range(pred.shape[0]):
        out.append(
            {
                "x": float(pred[i, 0]),
                "y": float(pred[i, 1]),
                "z": float(pred[i, 2]),
                "t": float(t[i]) if i < len(t) else float(i),
            }
        )
    return out


@app.post("/api/sindy/train", response_model=SindyTrainResponse)
def sindy_train(req: SindyTrainRequest):
    rec = req.recording
    axes = req.axes

    X, t = _extract_xyz_t(rec, axes)
    x0 = X[0]

    from sklearn.preprocessing import StandardScaler

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    if HAS_PYSINDY:
        try:
            # --- Fast nonlinear model ---
            optimizer = ps.STLSQ(threshold=0.01, alpha=0.0, max_iter=20)
            library = ps.PolynomialLibrary(degree=3, include_bias=False)
            diff = ps.FiniteDifference(order=1)

            model = ps.SINDy(
                feature_library=library,
                optimizer=optimizer,
                differentiation_method=diff,
                feature_names=["x", "y", "z"],
                discrete_time=False,
            )

            model.fit(X_scaled, t=t)
            tspan = t - t[0]
            if not np.all(np.diff(tspan) > 0):
                dt_avg = float(np.mean(np.diff(t)))
                tspan = np.linspace(0.0, dt_avg * (len(t) - 1), len(t))

            X_sim_scaled = model.simulate(scaler.transform([x0])[0], tspan)
            X_sim = scaler.inverse_transform(X_sim_scaled)

            equations, sparsity, features_per_eq = _extract_features_from_model(model)

        except Exception as e:
            print(f"PySINDy failed: {e}, falling back to linear")
            X_sim, equations, sparsity, features_per_eq = _fallback_linear_fit(X, t)
    else:
        X_sim, equations, sparsity, features_per_eq = _fallback_linear_fit(X, t)

    metrics_dict = _compute_metrics(X, X_sim)
    metrics_dict["sparsity"] = sparsity

    total_feats = sum(len(eq_f) for eq_f in features_per_eq)
    active_feats = sum(1 for eq_f in features_per_eq for f in eq_f if f.active)
    metrics_dict["activeFeatures"] = active_feats
    metrics_dict["totalFeatures"] = total_feats

    run_id = str(uuid.uuid4())
    resp = SindyTrainResponse(
        runId=run_id,
        metrics=Metrics(**metrics_dict),
        equations=equations,
        prediction=_align_prediction(X_sim, t),
        features=features_per_eq,
    )
    RUNS[run_id] = resp
    return resp


# --- add near the other imports ---
try:
    import reservoirpy as rpy
    from reservoirpy.nodes import Reservoir, Ridge

    HAS_RESERVOIRPY = True
    rpy.set_seed(42)
except Exception:
    HAS_RESERVOIRPY = False


# --- RC (ReservoirPy) endpoint: trains on provided data and predicts ---
@app.post("/api/rc/train", response_model=SindyTrainResponse)
def rc_train(req: SindyTrainRequest):
    """
    Echo State Network (ReservoirPy) training on user-provided recording.
    - No Bayesian optimization.
    - One-step-ahead teacher forcing on train split.
    - Autonomous rollout on test split for metrics/prediction.
    Returns SindyTrainResponse for UI compatibility.
    """
    if not HAS_RESERVOIRPY:
        raise HTTPException(
            status_code=500, detail="ReservoirPy not available in this environment."
        )

    rec = req.recording
    axes = req.axes

    # Extract data and timebase with your helper
    X, t = _extract_xyz_t(rec, axes)  # X: [T, 3], t: [T]
    T, dim = X.shape
    if dim != 3:
        raise HTTPException(
            status_code=400, detail=f"Expected 3D recording (x,y,z); got dim={dim}."
        )

    # ---- hyperparameters (static, no BO) ----
    N_RES = 200  # reservoir size
    LR = 0.5  # leaking rate
    SR = 0.9  # spectral radius
    RIDGE = 1e-6  # ridge regularization
    WARMUP = 100  # washout when fitting readout
    TRAIN_RATIO = 0.8

    # ---- split ----
    split_idx = max(WARMUP + 5, int(T * TRAIN_RATIO))
    split_idx = min(split_idx, T - 2)  # keep at least 2 points for test
    X_train = X[:split_idx]
    X_test = X[split_idx:]

    # ---- scale on train ----
    scaler = StandardScaler()
    Xs_train = scaler.fit_transform(X_train)
    Xs_test = scaler.transform(X_test)

    # ---- build & fit ESN (Reservoir >> Ridge) ----
    reservoir = Reservoir(N_RES, lr=LR, sr=SR)
    readout = Ridge(ridge=RIDGE)
    esn = reservoir >> readout

    # teacher forcing pairs on train split
    X_in = Xs_train[:-1]  # [L-1, 3]
    Y_tg = Xs_train[1:]  # [L-1, 3]
    if len(X_in) <= WARMUP + 1:
        raise HTTPException(
            status_code=400, detail="Not enough training samples for the chosen warmup."
        )

    esn = esn.fit(X_in, Y_tg, warmup=WARMUP)

    # ---- autonomous rollout on test split ----
    # seed with the last *true* train sample, then free-run for len(X_test)-1 steps
    steps = len(Xs_test) - 1
    if steps <= 0:
        # Edge case: almost no test data, just “simulate” the whole span from the first sample for completeness
        seed_vec = Xs_train[-1]
        steps = 1
        Xs_pred_test = np.repeat(seed_vec[None, :], steps, axis=0)
    else:
        u = Xs_train[-1][None, :]  # shape [1, 3]
        preds = np.zeros((steps, dim))
        for k in range(steps):
            y = esn.run(u)  # shape [1, 3]
            y = np.asarray(y).reshape(1, -1)
            preds[k] = y[0]
            u = y  # feed back prediction
        Xs_pred_test = preds

    # align predictions with original time:
    # we predict the future points X_test[1:], keep the very first test point as given
    X_pred = np.vstack(
        [
            X_train,  # original train portion (unchanged)
            scaler.inverse_transform(Xs_pred_test),  # predicted future
        ]
    )

    # ensure X_pred length matches t length
    X_pred = X_pred[: len(t)]

    # ---- metrics on test region only (exclude the first test anchor) ----
    y_true_test = X_test[1 : 1 + len(Xs_pred_test)]
    y_pred_test = scaler.inverse_transform(Xs_pred_test)
    test_len = min(len(y_true_test), len(y_pred_test))
    if test_len > 0:
        metrics_dict = _compute_metrics(y_true_test[:test_len], y_pred_test[:test_len])
    else:
        metrics_dict = {"mse": float("nan"), "r2": 0.0}
    # RC does not have sparsity/feature coefficients like SINDy; set placeholders
    metrics_dict["sparsity"] = 0.0
    metrics_dict["activeFeatures"] = 0
    metrics_dict["totalFeatures"] = 0

    # ---- equations / features placeholders to keep client happy ----
    equations = [
        f"ESN: N={N_RES}, lr={LR}, sr={SR}, ridge={RIDGE:.1e}, warmup={WARMUP}"
    ]
    features: List[List[FeatureInfo]] = []

    # ---- response ----
    run_id = str(uuid.uuid4())
    resp = SindyTrainResponse(
        runId=run_id,
        metrics=Metrics(**metrics_dict),
        equations=equations,
        prediction=_align_prediction(X_pred, t),
        features=features,
    )
    RUNS[run_id] = resp
    return resp


# STATIC FRONTEND
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="static")
