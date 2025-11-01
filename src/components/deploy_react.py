import os
import subprocess
import sys
import paramiko
import posixpath
from pathlib import Path
import shutil

# ======== CONFIGURE THESE ========
HOST = "164.52.212.223"                # Remote server IP
PORT = 22                              # Usually 22 for SSH
USERNAME = "root"                      # SSH username
PASSWORD = "VXSPEJ@tjnkc445"           # SSH password

# Local project directory where package.json lives (run npm run build here)
PROJECT_DIR = r"C:\Users\dtuser6\Downloads\securekyc_\securekyc (1)"

# Name of the build output folder inside the project (commonly "build" or "dist")
BUILD_DIR_NAME = "build"

# Remote tomcat webapps path where the build should be uploaded
REMOTE_TOMCAT_PATH = "/opt/apache-tomcat-9.0.83/webapps/UserVideoKyc"
# ==================================


def run_npm_build(project_dir: Path, timeout: int = None):
    """
    Run npm run build in project_dir.
    Handles Windows-specific npm.cmd and streams output live.
    """
    print(f"\n=== Running npm run build in: {project_dir} ===")
    if not project_dir.exists():
        raise FileNotFoundError(f"Project directory does not exist: {project_dir}")

    # Decide candidate executables
    candidates = []
    if os.name == 'nt':
        candidates = ["npm.cmd", "npm"]
    else:
        candidates = ["npm"]

    found = None
    for c in candidates:
        path = shutil.which(c)
        if path:
            found = c
            print(f"Found npm executable: {path}")
            break

    if not found:
        print("⚠️ Warning: npm not found on PATH.")
        print("Please ensure Node.js and npm are installed and available.")
        print("Try running `where npm` in CMD or reinstall Node.js.")
        raise FileNotFoundError("npm executable not found.")

    # Try direct execution
    try:
        proc = subprocess.Popen(
            [found, "run", "build"],
            cwd=str(project_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
    except FileNotFoundError:
        # Fallback to shell
        print("Direct execution failed — trying shell=True fallback...")
        proc = subprocess.Popen(
            "npm run build",
            cwd=str(project_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1,
            shell=True
        )

    # Stream output
    try:
        for line in proc.stdout:
            print(line.rstrip())
        proc.stdout.close()
        return_code = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        raise RuntimeError("npm build timed out and was killed.")
    except Exception:
        proc.kill()
        raise

    if return_code != 0:
        raise subprocess.CalledProcessError(return_code, ["npm", "run", "build"])

    print("✅ npm build completed successfully.\n")


def remote_exists(sftp, path):
    try:
        sftp.stat(path)
        return True
    except IOError:
        return False


def ensure_remote_dir(sftp, remote_path):
    """Recursively create directories on remote if missing."""
    remote_path = posixpath.normpath(remote_path)
    if remote_path == '/':
        return
    parts = remote_path.split('/')
    cur = ''
    if remote_path.startswith('/'):
        cur = '/'
    for part in parts:
        if not part:
            continue
        cur = posixpath.join(cur, part)
        try:
            sftp.stat(cur)
        except IOError:
            try:
                sftp.mkdir(cur)
            except Exception:
                if not remote_exists(sftp, cur):
                    raise


def upload_folder(sftp, local_dir, remote_dir):
    """Upload contents of local_dir recursively into remote_dir."""
    local_dir = Path(local_dir).resolve()
    if not local_dir.exists():
        raise FileNotFoundError(f"Local build directory not found: {local_dir}")

    ensure_remote_dir(sftp, remote_dir)

    for root, dirs, files in os.walk(local_dir):
        rel_path = os.path.relpath(root, local_dir)
        if rel_path in ('.', os.curdir):
            remote_root = remote_dir
        else:
            remote_root = posixpath.normpath(posixpath.join(remote_dir, '/'.join(Path(rel_path).parts)))

        ensure_remote_dir(sftp, remote_root)

        for f in files:
            local_file = os.path.join(root, f)
            remote_file = posixpath.join(remote_root, f)
            print(f"⬆️ Uploading {local_file} → {remote_file}")
            sftp.put(local_file, remote_file)
            try:
                st = os.stat(local_file).st_mode
                sftp.chmod(remote_file, st & 0o777)
            except Exception:
                pass


def main():
    print("🚀 Starting React app deployment...")

    project_dir = Path(PROJECT_DIR).resolve()
    local_build_dir = project_dir / BUILD_DIR_NAME

    # Step 1: npm build
    try:
        run_npm_build(project_dir)
    except subprocess.CalledProcessError as e:
        print(f"❌ npm build failed with exit code {e.returncode}.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error running npm build: {e}")
        sys.exit(1)

    if not local_build_dir.exists():
        print(f"❌ Build directory not found after build: {local_build_dir}")
        sys.exit(1)

    # Step 2: SSH remove old deployment
    print(f"\n🔗 Connecting to SSH {HOST}:{PORT} ...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(HOST, port=PORT, username=USERNAME, password=PASSWORD)
    except Exception as e:
        print("❌ SSH connection failed:", e)
        sys.exit(1)

    print(f"🧹 Removing remote folder: {REMOTE_TOMCAT_PATH}")
    stdin, stdout, stderr = ssh.exec_command(f"rm -rf -- {REMOTE_TOMCAT_PATH}")
    exit_status = stdout.channel.recv_exit_status()
    if exit_status != 0:
        err = stderr.read().decode().strip()
        if err:
            print("⚠️ rm error:", err)
    ssh.close()

    # Step 3: Upload build folder
    print("\n📤 Uploading new build to remote server...")
    transport = paramiko.Transport((HOST, PORT))
    try:
        transport.connect(username=USERNAME, password=PASSWORD)
        sftp = paramiko.SFTPClient.from_transport(transport)
    except Exception as e:
        print("❌ SFTP connection failed:", e)
        transport.close()
        sys.exit(1)

    try:
        upload_folder(sftp, str(local_build_dir), REMOTE_TOMCAT_PATH)
        print("✅ Upload finished successfully.")
    finally:
        sftp.close()
        transport.close()

    print("\n🎉 Deployment completed successfully!")


if __name__ == "__main__":
    main()
