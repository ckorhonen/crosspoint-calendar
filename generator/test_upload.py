#!/usr/bin/env python3
"""
Test upload script for CrossPoint e-ink device.
Usage: python3 test_upload.py <device-ip> <image-path> [port]
"""

import sys
import requests
from pathlib import Path

def discover_endpoint(device_ip: str, port: int = None) -> tuple[str, int] | None:
    """Try to discover the upload endpoint."""
    
    ports_to_try = [port] if port else [80, 8080, 8888, 3000, 5000]
    endpoints_to_try = [
        "/upload",
        "/api/upload", 
        "/",
        "/index.html",
        "/api/image",
        "/display",
    ]
    
    print(f"Discovering endpoint on {device_ip}...")
    
    for p in ports_to_try:
        for endpoint in endpoints_to_try:
            url = f"http://{device_ip}:{p}{endpoint}"
            try:
                # Try GET first to see if endpoint exists
                resp = requests.get(url, timeout=2)
                print(f"  {url} -> {resp.status_code}")
                if resp.status_code < 500:
                    return (endpoint, p)
            except requests.exceptions.Timeout:
                print(f"  {url} -> timeout")
            except requests.exceptions.ConnectionError:
                pass  # Port not open
            except Exception as e:
                print(f"  {url} -> {e}")
    
    return None

def upload_to_crosspoint(device_ip: str, file_path: str, port: int = 80, endpoint: str = "/upload") -> bool:
    """Upload file to CrossPoint device."""
    
    path = Path(file_path)
    if not path.exists():
        print(f"❌ Error: File not found: {file_path}")
        return False
    
    url = f"http://{device_ip}:{port}{endpoint}"
    print(f"\nUploading {path.name} to {url}...")
    
    # Determine content type
    suffix = path.suffix.lower()
    content_types = {
        '.bmp': 'image/bmp',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.epub': 'application/epub+zip',
    }
    content_type = content_types.get(suffix, 'application/octet-stream')
    
    try:
        with open(file_path, 'rb') as f:
            # Try multipart form upload first
            files = {'file': (path.name, f, content_type)}
            response = requests.post(url, files=files, timeout=30)
        
        print(f"Response: {response.status_code}")
        if response.text:
            print(f"Body: {response.text[:500]}")
        
        if response.status_code in [200, 201, 204]:
            print("✅ Upload successful!")
            return True
        else:
            print(f"❌ Upload failed: HTTP {response.status_code}")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ Upload timeout - device may be processing or unreachable")
        return False
    except requests.exceptions.ConnectionError as e:
        print(f"❌ Connection error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 test_upload.py <device-ip> <image-path> [port]")
        print("\nExamples:")
        print("  python3 test_upload.py 192.168.62.101 /tmp/crosspoint_test.bmp")
        print("  python3 test_upload.py 192.168.62.101 /tmp/crosspoint_test.bmp 8080")
        sys.exit(1)
    
    device_ip = sys.argv[1]
    file_path = sys.argv[2]
    port = int(sys.argv[3]) if len(sys.argv) > 3 else None
    
    # First, try to discover the endpoint
    result = discover_endpoint(device_ip, port)
    
    if result:
        endpoint, discovered_port = result
        print(f"\n✅ Found responsive endpoint: http://{device_ip}:{discovered_port}{endpoint}")
        success = upload_to_crosspoint(device_ip, file_path, discovered_port, "/upload")
    else:
        print(f"\n⚠️  No endpoints responded. Trying default upload anyway...")
        success = upload_to_crosspoint(device_ip, file_path, port or 80)
    
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
