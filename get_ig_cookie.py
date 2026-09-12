"""
Instagram Cookie Retriever via Selenium Chrome Browser.
Opens Chrome browser to Instagram login page, waits for user login,
and returns the session cookies as JSON.
"""

import sys
import json
import os
import subprocess
import tempfile
from time import sleep

CHROMEDRIVER_DISCOVERY_LOG = "[get_ig_cookie] "

def _find_chromedriver_executable():
    # Prefer system chromedriver first, then let Selenium Service resolve it.
    for name in ("chromedriver", "chromedriver.exe"):
        path = None
        try:
            import shutil
            path = shutil.which(name)
        except Exception:
            pass
        if path:
            _diag(f"{CHROMEDRIVER_DISCOVERY_LOG}Found chromedriver on PATH: {path}")
            return path
    _diag(f"{CHROMEDRIVER_DISCOVERY_LOG}No chromedriver on PATH; relying on Selenium Service auto-resolution.")
    return None

def _write_cookie_file_atomically(cookie_str, saved_path):
    # Write to a temp file in the same directory, then rename to avoid partial writes.
    try:
        os.makedirs(os.path.dirname(saved_path), exist_ok=True)
        dir_name = os.path.dirname(saved_path)
        fd, tmp_path = tempfile.mkstemp(dir=dir_name, prefix="._cookie_tmp_")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(cookie_str)
            os.replace(tmp_path, saved_path)
        except Exception:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
            raise
    except Exception as e:
        print(f"{CHROMEDRIVER_DISCOVERY_LOG}Failed to write cookie file: {e}", file=sys.stderr)

def _diag(*args, **kwargs):
    # Diagnostic messages go to stderr so stdout remains a single clean JSON line.
    kwargs.setdefault("file", sys.stderr)
    print(*args, **kwargs)



def kill_stale_chrome(profile_dir):
    try:
        profile_path = os.path.normpath(os.path.abspath(os.path.expanduser(profile_dir)))
        result = subprocess.run(
            ['wmic', 'process', 'where', "name='chrome.exe'", 'get', 'commandline,processid'],
            capture_output=True, text=True, timeout=5
        )
        if result.stdout:
            for line in result.stdout.splitlines():
                if profile_path.lower() in line.lower():
                    parts = line.strip().split()
                    if parts and parts[-1].isdigit():
                        pid = parts[-1]
                        subprocess.run(['taskkill', '/F', '/PID', pid], capture_output=True, timeout=5)
            sleep(1)
    except Exception:
        pass

def save_cookie(cookie_str):
    try:
        saved_path = os.path.join(os.path.dirname(__file__), "INSTAGRAM LOCATOR NEW", "_saved_cookie.txt")
        _write_cookie_file_atomically(cookie_str, saved_path)
        _diag(f"{CHROMEDRIVER_DISCOVERY_LOG}Cookie saved to: {saved_path}")
    except Exception:
        pass



def _emit_json_result(success, cookie_str, source):
    payload = {"success": success}
    if cookie_str:
        payload["cookie"] = cookie_str
    if source:
        payload["source"] = source
    # Use the lowest-level stdout to avoid any Python text buffering / newline transforms.
    raw = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
    try:
        fd = sys.stdout.fileno()
    except Exception:
        fd = 1
    os.write(fd, raw)
    sys.stderr.flush()
    sys.exit(0 if success else 1)


def get_insta_cookies():
    _find_chromedriver_executable()
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.service import Service
        from selenium.common.exceptions import WebDriverException, InvalidSessionIdException

        profile_dir = r"~/.instagram-location-search/chrome-data/"
        kill_stale_chrome(profile_dir)

        options = webdriver.ChromeOptions()
        profile_abs = os.path.abspath(os.path.expanduser(profile_dir))
        options.add_argument(f"--user-data-dir={profile_abs}")
        options.add_argument("--profile-directory=instagram-location-profile")
        options.add_experimental_option("detach", True)

        service = Service()
        _diag(f"{CHROMEDRIVER_DISCOVERY_LOG}Service executable: {getattr(service, 'executable_path', None) or getattr(service, '_executable', None)}")
        driver = webdriver.Chrome(options=options, service=service)
        driver.get("https://www.instagram.com/")
        try:
            sys.stdout.reconfigure(line_buffering=False)
        except Exception:
            pass

        # Wait up to 300 seconds (5 min) for login cookie
        max_wait = 300
        waited = 0
        while waited < max_wait:
            try:
                cookies = driver.get_cookies()
                session_cookie = next((c for c in cookies if c.get("name") == "sessionid"), None)
                if session_cookie:
                    cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
                    save_cookie(cookie_str)
                    _emit_json_result(True, cookie_str, None)
            except (InvalidSessionIdException, WebDriverException):
                # Browser was closed by user before a fresh login was detected.
                _emit_json_result(False, "", "browser_closed")
            except Exception:
                pass

            sleep(1)
            waited += 1

        _diag(f"{CHROMEDRIVER_DISCOVERY_LOG}Login wait timeout after {max_wait}s.")
        _emit_json_result(False, "", "timeout_waiting_for_login")
        return

    except Exception as e:
        _diag(f"{CHROMEDRIVER_DISCOVERY_LOG}Chrome automation error: {e}")
        _emit_json_result(False, "", "chrome_error")


if __name__ == "__main__":
    get_insta_cookies()
