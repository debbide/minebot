import json
import os
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
import uuid

class TaskStore:
    def __init__(self, data_dir="data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.tasks_file = self.data_dir / "tasks.json"
        self._load_tasks()
    
    def _load_tasks(self):
        """Load tasks from JSON file"""
        if self.tasks_file.exists():
            try:
                with open(self.tasks_file, 'r', encoding='utf-8') as f:
                    self.tasks = json.load(f)
            except Exception as e:
                print(f"[TaskStore] Failed to load tasks: {e}")
                self.tasks = []
        else:
            self.tasks = []
    
    def _save_tasks(self):
        """Save tasks to JSON file"""
        try:
            with open(self.tasks_file, 'w', encoding='utf-8') as f:
                json.dump(self.tasks, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[TaskStore] Failed to save tasks: {e}")
    
    def get_all(self) -> List[Dict]:
        """Get all tasks"""
        return self.tasks
    
    def get_by_id(self, task_id: str) -> Optional[Dict]:
        """Get task by ID"""
        for task in self.tasks:
            if task.get('id') == task_id:
                return task
        return None
    
    def add(self, task_data: Dict) -> Dict:
        """Add a new task"""
        task = {
            'id': str(uuid.uuid4()),
            'name': task_data.get('name', 'Unnamed Task'),
            'url': task_data['url'],
            'username': task_data['username'],
            'password': task_data['password'],
            'proxy': task_data.get('proxy', ''),
            'selectors': task_data.get('selectors', {}),
            'timeout': task_data.get('timeout', 120),
            'wait_time': task_data.get('wait_time', 5),
            'success_keywords': task_data.get('success_keywords', []),
            'interval': task_data.get('interval', 6),  # hours
            'enabled': task_data.get('enabled', True),
            'lastRun': None,
            'lastResult': None
        }
        self.tasks.append(task)
        self._save_tasks()
        return task
    
    def update(self, task_id: str, updates: Dict) -> Optional[Dict]:
        """Update an existing task"""
        for i, task in enumerate(self.tasks):
            if task.get('id') == task_id:
                # Update fields
                for key, value in updates.items():
                    if key != 'id':  # Don't allow ID changes
                        task[key] = value
                self.tasks[i] = task
                self._save_tasks()
                return task
        return None
    
    def delete(self, task_id: str) -> bool:
        """Delete a task"""
        for i, task in enumerate(self.tasks):
            if task.get('id') == task_id:
                self.tasks.pop(i)
                self._save_tasks()
                return True
        return False
    
    def update_result(self, task_id: str, result: Dict):
        """Update task execution result"""
        for task in self.tasks:
            if task.get('id') == task_id:
                task['lastRun'] = datetime.now().isoformat()
                task['lastResult'] = result
                self._save_tasks()
                break
