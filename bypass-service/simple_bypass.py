# ============================================================
# Cloudflare Turnstile 绕过工具 - 精简版（推荐）
# 基于 SeleniumBase UC Mode，一个文件搞定
# 支持 Mac / Windows / Linux
# ============================================================

import os
import sys
import time
import json
import random
import platform
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

from seleniumbase import SB


def load_proxies_from_file(filepath: str = "proxy.txt") -> List[str]:
    """
    从文件加载代理列表
    
    参数:
        filepath: 代理文件路径
    
    返回:
        代理列表 (格式: http://IP:PORT)
    """
    proxies = []
    path = Path(filepath)
    
    if not path.exists():
        return proxies
    
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            # 跳过空行和注释
            if line and not line.startswith("#"):
                # 确保代理有协议前缀
                if not line.startswith(("http://", "https://", "socks5://", "socks4://")):
                    line = f"http://{line}"
                proxies.append(line)
    
    return proxies


def get_random_proxy(filepath: str = "proxy.txt") -> Optional[str]:
    """
    从文件中随机获取一个代理
    
    参数:
        filepath: 代理文件路径
    
    返回:
        随机代理或None
    """
    proxies = load_proxies_from_file(filepath)
    if proxies:
        return random.choice(proxies)
    return None


def is_linux() -> bool:
    """检测是否为Linux系统"""
    return platform.system().lower() == "linux"


def check_proxy_alive(proxy: str, timeout: float = 8.0) -> bool:
    """
    检测代理是否支持HTTPS隧道（使用HTTPS网站测试）
    
    参数:
        proxy: 代理地址
        timeout: 超时时间（秒）
    
    返回:
        代理是否可用
    """
    import urllib.request
    import ssl
    
    try:
        # 确保代理格式正确
        if "://" not in proxy:
            proxy = f"http://{proxy}"
        
        # 创建代理处理器
        proxy_handler = urllib.request.ProxyHandler({
            'http': proxy,
            'https': proxy
        })
        opener = urllib.request.build_opener(proxy_handler)
        
        # 使用HTTPS网站测试，确保代理支持HTTPS隧道(CONNECT)
        request = urllib.request.Request(
            "https://httpbin.org/ip",
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:84.0) Gecko/20100101 Firefox/84.0'
            }
        )
        
        # 忽略SSL证书验证
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        response = opener.open(request, timeout=timeout)
        
        if response.status == 200:
            return True
        return False
        
    except Exception:
        return False


def get_working_proxy(filepath: str = "proxy.txt", max_check: int = 10, timeout: float = 3.0) -> Optional[str]:
    """
    从文件中获取一个可用的代理
    
    参数:
        filepath: 代理文件路径
        max_check: 最多检测代理数量
        timeout: 每个代理的检测超时
    
    返回:
        可用的代理或None
    """
    proxies = load_proxies_from_file(filepath)
    if not proxies:
        return None
    
    # 随机打乱顺序
    random.shuffle(proxies)
    
    checked = 0
    for proxy in proxies:
        if checked >= max_check:
            break
        
        print(f"[*] 检测代理: {proxy}...", end=" ")
        if check_proxy_alive(proxy, timeout):
            print("✓ 可用")
            return proxy
        else:
            print("✗ 不可用")
        checked += 1
    
    return None


def setup_linux_display():
    """
    设置Linux显示环境（用于无桌面环境的服务器）
    需要安装: xvfb, pyvirtualdisplay
    """
    if is_linux() and not os.environ.get("DISPLAY"):
        # 尝试使用虚拟显示
        try:
            from pyvirtualdisplay import Display
            display = Display(visible=False, size=(1920, 1080))
            display.start()
            os.environ["DISPLAY"] = display.new_display_var
            print("[*] Linux: 已启动虚拟显示 (Xvfb)")
            return display
        except ImportError:
            print("[!] Linux无显示环境，请运行: bash install_linux.sh")
            print("[!] 或手动安装:")
            print("    apt-get install -y xvfb libglib2.0-0 libnss3 libatk1.0-0")
            print("    pip install pyvirtualdisplay")
            sys.exit(1)
        except Exception as e:
            print(f"[!] 启动虚拟显示失败: {e}")
            print("[!] 请确保已安装 Xvfb: apt-get install -y xvfb")
            sys.exit(1)
    return None


def check_chrome_installed():
    """检查Chrome是否已安装"""
    import shutil
    
    chrome_paths = [
        "google-chrome",
        "google-chrome-stable", 
        "chromium",
        "chromium-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    ]
    
    for path in chrome_paths:
        if shutil.which(path):
            return True
    
    return False


def bypass_cloudflare_with_proxy_rotation(
    url: str,
    proxy_file: str = "proxy.txt",
    wait_time: float = 5.0,
    save_cookies: bool = True,
    timeout: float = 60.0,
    max_retries: int = 3,
    check_proxy: bool = True
) -> Dict[str, Any]:
    """
    使用proxy.txt中的代理依次尝试绕过
    
    参数:
        url: 目标网站URL
        proxy_file: 代理文件路径
        wait_time: 等待页面加载时间
        save_cookies: 是否保存Cookie
        timeout: 单次超时时间
        max_retries: 每个代理最大重试次数
        check_proxy: 是否预先检测代理存活
    """
    proxies = load_proxies_from_file(proxy_file)
    
    if not proxies:
        print("[!] 代理文件为空，使用直连模式")
        return bypass_cloudflare(url, None, wait_time, save_cookies, timeout, 1)
    
    print(f"[*] 从 {proxy_file} 加载了 {len(proxies)} 个代理")
    
    # 随机打乱代理顺序
    random.shuffle(proxies)
    
    for i, proxy in enumerate(proxies[:max_retries], 1):
        print(f"\n{'='*50}")
        print(f"[*] 尝试代理 {i}/{min(len(proxies), max_retries)}: {proxy}")
        print(f"{'='*50}")
        
        # 检测代理存活
        if check_proxy:
            print(f"[*] 检测代理存活...", end=" ")
            if not check_proxy_alive(proxy, timeout=3.0):
                print("✗ 不可用，跳过")
                continue
            print("✓ 可用")
        
        # 尝试绕过
        result = bypass_cloudflare(url, proxy, wait_time, save_cookies, timeout, 1)
        
        if result["success"]:
            result["proxy_used"] = proxy
            return result
        
        print(f"[-] 代理 {proxy} 失败，尝试下一个...")
    
    return {
        "success": False,
        "cookies": {},
        "cf_clearance": None,
        "user_agent": None,
        "error": f"所有代理均失败 (尝试了 {min(len(proxies), max_retries)} 个)",
        "attempts": min(len(proxies), max_retries)
    }


def bypass_parallel(
    url: str,
    proxy_file: str = "proxy.txt",
    batch_size: int = 3,
    timeout: float = 15.0,
    wait_time: float = 5.0,
    save_cookies: bool = True,
    check_proxy: bool = True,
    max_batches: int = 10
) -> Dict[str, Any]:
    """
    并行启动多个浏览器，使用不同代理同时尝试
    
    参数:
        url: 目标网站URL
        proxy_file: 代理文件路径
        batch_size: 每批并行浏览器数量 (默认3个)
        timeout: 每批超时时间 (默认15秒)
        wait_time: 页面加载等待时间
        save_cookies: 是否保存Cookie
        check_proxy: 是否预先检测代理存活
        max_batches: 最大批次数
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading
    
    proxies = load_proxies_from_file(proxy_file)
    
    if not proxies:
        print("[!] 代理文件为空")
        return {"success": False, "error": "无可用代理"}
    
    print(f"[*] 从 {proxy_file} 加载了 {len(proxies)} 个代理")
    print(f"[*] 并行模式: 每批 {batch_size} 个浏览器, 超时 {timeout}秒")
    
    # 随机打乱代理
    random.shuffle(proxies)
    
    # 预先检测代理存活
    if check_proxy:
        print("[*] 预先检测代理存活...")
        alive_proxies = []
        for proxy in proxies[:50]:  # 最多检测50个
            if check_proxy_alive(proxy, timeout=2.0):
                alive_proxies.append(proxy)
                print(f"  ✓ {proxy}")
                if len(alive_proxies) >= batch_size * max_batches:
                    break
            else:
                print(f"  ✗ {proxy}")
        proxies = alive_proxies
        print(f"[*] 找到 {len(proxies)} 个存活代理")
    
    if not proxies:
        return {"success": False, "error": "无存活代理"}
    
    # 用于存储成功结果的线程安全变量
    success_result = {"result": None}
    result_lock = threading.Lock()
    stop_event = threading.Event()
    
    def try_bypass(proxy: str, browser_id: int) -> Dict[str, Any]:
        """单个浏览器尝试"""
        if stop_event.is_set():
            return {"success": False, "error": "已取消"}
        
        try:
            print(f"[浏览器{browser_id}] 启动，代理: {proxy}")
            
            with SB(uc=True, test=True, locale="en", proxy=proxy) as sb:
                if stop_event.is_set():
                    return {"success": False, "error": "已取消"}
                
                sb.uc_open_with_reconnect(url, reconnect_time=wait_time)
                time.sleep(2)
                
                if stop_event.is_set():
                    return {"success": False, "error": "已取消"}
                
                # 检测并处理验证
                page_source = sb.get_page_source().lower()
                if any(x in page_source for x in ["turnstile", "challenges.cloudflare", "just a moment"]):
                    print(f"[浏览器{browser_id}] 检测到验证，点击...")
                    try:
                        sb.uc_gui_click_captcha()
                        time.sleep(3)
                    except:
                        pass
                
                # 获取Cookie
                cookies_list = sb.get_cookies()
                cookies = {c["name"]: c["value"] for c in cookies_list}
                cf_clearance = cookies.get("cf_clearance")
                
                if cf_clearance:
                    result = {
                        "success": True,
                        "cookies": cookies,
                        "cf_clearance": cf_clearance,
                        "user_agent": sb.execute_script("return navigator.userAgent"),
                        "proxy_used": proxy,
                        "browser_id": browser_id
                    }
                    
                    # 设置成功结果并通知其他线程停止
                    with result_lock:
                        if success_result["result"] is None:
                            success_result["result"] = result
                            stop_event.set()
                            print(f"[浏览器{browser_id}] ✅ 成功！")
                    
                    return result
                else:
                    print(f"[浏览器{browser_id}] 未获取到cf_clearance")
                    return {"success": False, "error": "未获取到cf_clearance", "proxy": proxy}
                    
        except Exception as e:
            print(f"[浏览器{browser_id}] 错误: {str(e)[:50]}")
            return {"success": False, "error": str(e), "proxy": proxy}
    
    # 分批执行
    batch_num = 0
    for i in range(0, len(proxies), batch_size):
        if batch_num >= max_batches:
            break
        
        batch_num += 1
        batch_proxies = proxies[i:i+batch_size]
        
        print(f"\n{'='*60}")
        print(f"[*] 第 {batch_num} 批: 启动 {len(batch_proxies)} 个浏览器")
        print(f"{'='*60}")
        
        stop_event.clear()
        
        with ThreadPoolExecutor(max_workers=batch_size) as executor:
            futures = {
                executor.submit(try_bypass, proxy, idx+1): proxy 
                for idx, proxy in enumerate(batch_proxies)
            }
            
            try:
                # 等待超时或成功
                for future in as_completed(futures, timeout=timeout):
                    result = future.result()
                    if result["success"]:
                        # 保存Cookie
                        if save_cookies:
                            save_dir = Path("output/cookies")
                            save_dir.mkdir(parents=True, exist_ok=True)
                            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                            with open(save_dir / f"cookies_{ts}.json", "w", encoding="utf-8") as f:
                                json.dump(result, f, indent=2)
                            print(f"[+] Cookie已保存")
                        return result
                        
            except Exception as e:
                print(f"[!] 批次超时或错误: {e}")
                stop_event.set()
        
        # 检查是否有成功结果
        if success_result["result"]:
            return success_result["result"]
        
        print(f"[-] 第 {batch_num} 批全部失败，尝试下一批...")
    
    return {
        "success": False,
        "cookies": {},
        "cf_clearance": None,
        "error": f"所有批次均失败 (共 {batch_num} 批)",
        "attempts": batch_num * batch_size
    }


def bypass_cloudflare(
    url: str,
    proxy: Optional[str] = None,
    wait_time: float = 5.0,
    save_cookies: bool = True,
    timeout: float = 60.0,
    max_retries: int = 1
) -> Dict[str, Any]:
    """
    绕过 Cloudflare 验证并获取 Cookie
    
    参数:
        url: 目标网站URL
        proxy: 代理地址（可选，格式: http://host:port）
        wait_time: 等待页面加载时间（秒）
        save_cookies: 是否保存Cookie到文件
        timeout: 早停超时时间（秒），默认15秒
        max_retries: 最大重试次数，默认3次
    
    返回:
        {
            "success": bool,           # 是否成功
            "cookies": dict,           # Cookie字典 {name: value}
            "cf_clearance": str,       # cf_clearance值
            "user_agent": str,         # 使用的User-Agent
            "error": str               # 错误信息（如果失败）
        }
    
    使用示例:
        result = bypass_cloudflare("https://example.com")
        if result["success"]:
            print(f"cf_clearance: {result['cf_clearance']}")
    """
    import signal
    
    result = {
        "success": False,
        "cookies": {},
        "cf_clearance": None,
        "user_agent": None,
        "error": None,
        "attempts": 0
    }
    
    # 超时处理器
    class TimeoutError(Exception):
        pass
    
    def timeout_handler(signum, frame):
        raise TimeoutError("操作超时")
    

    # 重试循环
    for attempt in range(1, max_retries + 1):
        result["attempts"] = attempt
        print(f"\n[*] 第 {attempt}/{max_retries} 次尝试...")
        
        # 设置超时（仅Unix系统支持信号）
        try:
            if not is_linux() or platform.system() == "Darwin":
                signal.signal(signal.SIGALRM, timeout_handler)
                signal.alarm(int(timeout))
        except (AttributeError, ValueError):
            pass  # Windows 不支持
        
        try:
            print(f"[*] 目标: {url}")
            if proxy:
                print(f"[*] 代理: {proxy}")
            
            # 优先尝试 UC Mode
            try:
                with SB(uc=True, test=True, locale="en", proxy=proxy) as sb:
                    print("[*] 浏览器已启动 (UC Mode)，正在加载页面...")
                    temp_result = _run_sb_logic(sb, url, wait_time, save_cookies)
                    if temp_result["success"]:
                        result.update(temp_result)
                        return result
                    else:
                        result["error"] = temp_result["error"]
                        print(f"[-] UC Mode 失败: {result['error']}")
            except Exception as e:
                error_msg = str(e)
                if "Exec format error" in error_msg or "executable" in error_msg.lower():
                    print(f"[!] UC Mode 启动失败 (可能是架构兼容性问题): {e}")
                    print("[*] 尝试降级到普通模式 (Standard Mode)...")
                    
                    # 降级尝试: 普通模式 (非 UC)
                    # 使用系统安装的 chromium-driver (如果可用)
                    # 注意: 普通模式更容易被检测，但能够运行
                    try:
                        with SB(uc=False, test=True, locale="en", proxy=proxy) as sb:
                            print("[*] 浏览器已启动 (Standard Mode)，正在加载页面...")
                            temp_result = _run_sb_logic(sb, url, wait_time, save_cookies)
                            if temp_result["success"]:
                                result.update(temp_result)
                                return result
                            else:
                                result["error"] = temp_result["error"]
                                print(f"[-] Standard Mode 失败: {result['error']}")
                    except Exception as e_std:
                        result["error"] = str(e_std)
                        print(f"[-] Standard Mode 错误: {e_std}")
                else:
                    result["error"] = error_msg
                    print(f"[-] UC Mode 错误: {e}")
            
        except TimeoutError:
            print(f"[-] 超时 ({timeout}秒)")
            except:
                pass
            return False
        except Exception as e:
            result["error"] = str(e)
            print(f"[-] 错误: {e}")
            try:
                signal.alarm(0)
            except:
                pass
            return False
    
    # 重试循环
    for attempt in range(1, max_retries + 1):
        result["attempts"] = attempt
        if single_attempt(attempt):
            return result
        
        if attempt < max_retries:
            print(f"[*] 等待2秒后重试...")
            time.sleep(2)
    
    if not result["error"]:
        result["error"] = f"达到最大重试次数 ({max_retries})"
    
    return result


# ============================================================
# 命令行入口
# ============================================================
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Cloudflare Turnstile 绕过工具 (支持 Mac/Windows/Linux)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python simple_bypass.py https://example.com
  python simple_bypass.py https://example.com -p http://127.0.0.1:7890
  python simple_bypass.py https://example.com --proxy-file proxy.txt
  python simple_bypass.py https://example.com -f proxy.txt --random
        """
    )
    parser.add_argument("url", help="目标URL")
    parser.add_argument("-p", "--proxy", help="代理地址 (直接指定)")
    parser.add_argument("-f", "--proxy-file", default="proxy.txt", help="代理文件路径 (默认: proxy.txt)")
    parser.add_argument("-r", "--rotate", action="store_true", help="顺序代理轮换模式")
    parser.add_argument("-P", "--parallel", action="store_true", help="并行模式: 同时启动多个浏览器")
    parser.add_argument("-b", "--batch", type=int, default=3, help="并行模式每批浏览器数 (默认: 3)")
    parser.add_argument("-w", "--wait", type=float, default=5.0, help="等待时间 (默认: 5秒)")
    parser.add_argument("-t", "--timeout", type=float, default=60.0, help="超时 (默认: 60秒)")
    parser.add_argument("-n", "--retries", type=int, default=3, help="最大尝试批次/代理数 (默认: 3)")
    parser.add_argument("-c", "--check-proxy", action="store_true", help="预先检测代理存活")
    parser.add_argument("--no-save", action="store_true", help="不保存Cookie到文件")
    args = parser.parse_args()
    
    # 检查Chrome是否安装
    if not check_chrome_installed():
        print("\n[!] 错误: Chrome/Chromium 未安装!")
        if is_linux():
            print("[!] Linux 请运行: bash install_linux.sh")
            print("[!] 或手动安装: wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && dpkg -i google-chrome-stable_current_amd64.deb")
        else:
            print("[!] 请安装 Google Chrome: https://www.google.com/chrome/")
        sys.exit(1)
    
    # Linux 虚拟显示设置
    display = setup_linux_display()
    
    print("\n" + "="*50)
    print("Cloudflare Turnstile 绕过工具")
    print(f"系统: {platform.system()} {platform.release()}")
    print("="*50)
    
    # 并行模式
    if args.parallel:
        print(f"[*] 🚀 并行模式: 每批 {args.batch} 个浏览器")
        print(f"[*] 超时: {args.timeout}秒 | 最多 {args.retries} 批")
        print(f"[*] 检测存活: {'是' if args.check_proxy else '否'}")
        
        result = bypass_parallel(
            url=args.url,
            proxy_file=args.proxy_file,
            batch_size=args.batch,
            timeout=args.timeout,
            wait_time=args.wait,
            save_cookies=not args.no_save,
            check_proxy=args.check_proxy,
            max_batches=args.retries
        )
    # 顺序代理轮换模式
    elif args.rotate:
        print(f"[*] 顺序轮换模式 | 最多尝试 {args.retries} 个代理")
        print(f"[*] 超时: {args.timeout}秒 | 检测存活: {'是' if args.check_proxy else '否'}")
        
        result = bypass_cloudflare_with_proxy_rotation(
            url=args.url,
            proxy_file=args.proxy_file,
            wait_time=args.wait,
            save_cookies=not args.no_save,
            timeout=args.timeout,
            max_retries=args.retries,
            check_proxy=args.check_proxy
        )
    else:
        # 单代理/直连模式
        proxy = args.proxy
        if proxy:
            print(f"[*] 使用指定代理: {proxy}")
        else:
            print("[*] 直连模式（无代理）")
        
        print(f"[*] 超时: {args.timeout}秒")
        
        result = bypass_cloudflare(
            url=args.url,
            proxy=proxy,
            wait_time=args.wait,
            save_cookies=not args.no_save,
            timeout=args.timeout,
            max_retries=1
        )
    
    print("\n" + "-"*50)
    if result["success"]:
        print(f"✅ 成功 | Cookie: {len(result['cookies'])} 个")
        if result["cf_clearance"]:
            print(f"📍 cf_clearance: {result['cf_clearance'][:50]}...")
    else:
        print(f"❌ 失败: {result['error']}")
    print("-"*50 + "\n")
    
    # 清理Linux虚拟显示
    if display:
        display.stop()
