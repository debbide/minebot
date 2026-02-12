import subprocess
import sys

def run_command(command):
    print(f"Executing: {' '.join(command)}")
    try:
        result = subprocess.run(command, check=True, text=True, capture_output=True)
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        # Git returns 1 if there is nothing to commit, which is fine to ignore sometimes, 
        # but usually we want to know. For 'commit', we can check stdout.
        if "nothing to commit" in e.stdout or "nothing to commit" in e.stderr:
            print("Nothing to commit.")
        else:
            print(f"Error executing command: {e.stderr}")
            if command[1] != "commit": # Allow commit to 'fail' if empty, but stop on others
                sys.exit(1)

def main():
    # 1. Add changes
    run_command(["git", "add", "."])
    
    # 2. Commit changes
    # Use the message provided in the previous step
    run_command(["git", "commit", "-m", "fix: robust sanitization for TUIC fallback UUID"])
    
    # 3. Push changes
    run_command(["git", "push", "origin", "main"])

if __name__ == "__main__":
    main()
