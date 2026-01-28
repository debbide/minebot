# api.py
# Full-Stack Renewal Service API

import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime
from pathlib import Path

# Import existing modules
from bypass import bypass_cloudflare, setup_display
from simple_bypass import bypass_cloudflare as bypass_seleniumbase_impl
from renewal import RenewalHandler
from task_store import TaskStore

app = Flask(__name__, static_folder='ui/dist', static_url_path='')
CORS(app)

# Global display (for Linux)
display = None

# Task store
task_store = TaskStore()

# Scheduler
scheduler = BackgroundScheduler()
scheduler.start()

# Renewal handler
renewal_handler = RenewalHandler()

# ==================== Existing Endpoints ====================

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "service": "renewal-service"})

@app.route('/bypass', methods=['POST'])
def bypass():
    data = request.json
    if not data or 'url' not in data:
        return jsonify({"success": False, "error": "Missing 'url' parameter"}), 400
    
    url = data.get('url')
    proxy = data.get('proxy')
    timeout = data.get('timeout', 60.0)
    mode = data.get('mode', 'default')
    
    print(f"[API] Request bypass ({mode}) for: {url} (Proxy: {proxy})")
    
    try:
        if mode == 'seleniumbase':
            result = bypass_seleniumbase_impl(
                url=url,
                proxy=proxy,
                timeout=timeout,
                save_cookies=False,
                wait_time=8.0
            )
        else:
            result = bypass_cloudflare(
                url=url,
                proxy=proxy,
                timeout=timeout,
                save_cookies=False
            )
            
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/renew', methods=['POST'])
def renew():
    data = request.json
    url = data.get('url')
    username = data.get('username')
    password = data.get('password')
    proxy = data.get('proxy')
    selectors = data.get('selectors', {})
    
    if not url or not username or not password:
        return jsonify({"success": False, "error": "Missing url, username or password"}), 400
        
    print(f"[*] 收到续期请求: {url} ({username})")
    
    result = renewal_handler.run_renewal(url, username, password, proxy, selectors)
    
    return jsonify(result)


# ==================== Task Management API ====================

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """Get all tasks"""
    tasks = task_store.get_all()
    return jsonify(tasks)


@app.route('/api/tasks', methods=['POST'])
def add_task():
    """Add a new task"""
    try:
        data = request.json
        task = task_store.add(data)
        
        # Schedule the task if enabled
        if task.get('enabled'):
            schedule_task(task)
        
        return jsonify({'success': True, 'task': task})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/tasks/<task_id>', methods=['PUT'])
def update_task(task_id):
    """Update an existing task"""
    try:
        data = request.json
        task = task_store.update(task_id, data)
        
        if not task:
            return jsonify({'success': False, 'error': 'Task not found'}), 404
        
        # Reschedule if needed
        reschedule_task(task)
        
        return jsonify({'success': True, 'task': task})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    """Delete a task"""
    try:
        # Remove from scheduler
        job_id = f"task_{task_id}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        
        success = task_store.delete(task_id)
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Task not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/tasks/<task_id>/run', methods=['POST'])
def run_task(task_id):
    """Manually trigger a task"""
    try:
        task = task_store.get_by_id(task_id)
        if not task:
            return jsonify({'success': False, 'error': 'Task not found'}), 404
        
        # Execute task
        result = execute_task(task)
        
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/tasks/<task_id>/toggle', methods=['POST'])
def toggle_task(task_id):
    """Enable/disable a task"""
    try:
        data = request.json
        enabled = data.get('enabled', True)
        
        task = task_store.update(task_id, {'enabled': enabled})
        if not task:
            return jsonify({'success': False, 'error': 'Task not found'}), 404
        
        # Update scheduler
        if enabled:
            schedule_task(task)
        else:
            job_id = f"task_{task_id}"
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


# ==================== Task Execution & Scheduling ====================

def execute_task(task):
    """Execute a renewal task"""
    task_id = task['id']
    print(f"[Scheduler] Executing task: {task['name']} ({task_id})")
    
    try:
        result = renewal_handler.run_renewal(
            url=task['url'],
            username=task['username'],
            password=task['password'],
            proxy=task.get('proxy'),
            selectors=task.get('selectors', {})
        )
        
        # Update task result
        task_store.update_result(task_id, result)
        
        return result
    except Exception as e:
        error_result = {
            'success': False,
            'message': f'Execution failed: {str(e)}',
            'timestamp': datetime.now().isoformat()
        }
        task_store.update_result(task_id, error_result)
        return error_result


def schedule_task(task):
    """Schedule a task to run periodically"""
    task_id = task['id']
    interval_hours = task.get('interval', 6)
    job_id = f"task_{task_id}"
    
    # Remove existing job if any
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    
    # Add new job
    scheduler.add_job(
        func=execute_task,
        trigger=IntervalTrigger(hours=interval_hours),
        args=[task],
        id=job_id,
        name=f"Renewal: {task['name']}",
        replace_existing=True
    )
    
    print(f"[Scheduler] Scheduled task {task['name']} (every {interval_hours} hours)")


def reschedule_task(task):
    """Reschedule a task"""
    if task.get('enabled'):
        schedule_task(task)
    else:
        job_id = f"task_{task_id}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)


# ==================== Frontend Static Files ====================

@app.route('/')
def index():
    """Serve React app"""
    dist_dir = Path(__file__).parent / 'ui' / 'dist'
    if dist_dir.exists():
        return send_from_directory(str(dist_dir), 'index.html')
    else:
        return jsonify({
            "error": "Frontend not built",
            "message": "Please run 'npm run build' in the ui directory"
        }), 404


@app.route('/<path:path>')
def serve_static(path):
    """Serve other static files"""
    dist_dir = Path(__file__).parent / 'ui' / 'dist'
    if dist_dir.exists() and (dist_dir / path).exists():
        return send_from_directory(str(dist_dir), path)
    else:
        # Fallback to index.html for client-side routing
        return send_from_directory(str(dist_dir), 'index.html')


# ==================== Startup ====================

if __name__ == '__main__':
    # Initialize display on startup (for Linux/Docker)
    display = setup_display()
    
    # Load and schedule existing tasks
    print("[Startup] Loading tasks...")
    tasks = task_store.get_all()
    for task in tasks:
        if task.get('enabled'):
            schedule_task(task)
    print(f"[Startup] Loaded {len(tasks)} tasks, {sum(1 for t in tasks if t.get('enabled'))} enabled")
    
    port = int(os.environ.get('PORT', 5000))
    print(f"[*] Renewal Service starting on port {port}...")
    print(f"[*] Frontend: http://localhost:{port}")
    print(f"[*] API: http://localhost:{port}/api")
    
    app.run(host='0.0.0.0', port=port, debug=False)
