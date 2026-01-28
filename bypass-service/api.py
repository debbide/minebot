# api.py
# Cloudflare Bypass Service API

import os
from flask import Flask, request, jsonify
from bypass import bypass_cloudflare, setup_display

app = Flask(__name__)

# Global display (for Linux)
display = None



@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "service": "cloudflare-bypass"})

@app.route('/bypass', methods=['POST'])
def bypass():
    data = request.json
    if not data or 'url' not in data:
        return jsonify({"success": False, "error": "Missing 'url' parameter"}), 400
    
    url = data.get('url')
    proxy = data.get('proxy') # Optional
    timeout = data.get('timeout', 60.0)
    
    print(f"[API] Request bypass for: {url} (Proxy: {proxy})")
    
    # Call the existing bypass function
    try:
        result = bypass_cloudflare(
            url=url,
            proxy=proxy,
            timeout=timeout,
            save_cookies=False # Don't save to file, just return
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    # Initialize display on startup
    display = setup_display()
    
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
