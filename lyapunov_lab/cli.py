import sys
import subprocess
import click

@click.group()
def cli():
    """Lyapunov-Lab CLI — manage the Chaos Analyzer dashboard."""
    pass

@cli.command()
@click.option("--port", default=3000, show_default=True, help="Port to run the backend server on")
def start(port):
    """Start the FastAPI backend server."""
    click.echo(f"Starting backend at http://localhost:{port}")
    subprocess.Popen([
        sys.executable, "-m", "uvicorn",
        "lyapunov_lab.backend.app:app",
        "--host", "0.0.0.0",
        "--port", str(port)
    ])
    input("Press Enter to stop the backend...\n")

if __name__ == "__main__":
    cli()
