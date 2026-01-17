#!/usr/bin/env python3
"""Create a test image for CrossPoint e-ink display validation."""

from PIL import Image, ImageDraw, ImageFont
from datetime import datetime
import os

# CrossPoint X4 likely uses 800x480 or similar
WIDTH = 800
HEIGHT = 480

def create_test_image(output_path: str = "/tmp/crosspoint_test.bmp"):
    """Generate a test pattern image."""
    
    # Create grayscale image (e-ink optimized)
    img = Image.new('L', (WIDTH, HEIGHT), color=255)  # White background
    draw = ImageDraw.Draw(img)
    
    # Try to use a nice font, fall back to default
    try:
        font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 48)
        font_medium = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
    except:
        font_large = ImageFont.load_default()
        font_medium = font_large
        font_small = font_large
    
    # Draw border
    draw.rectangle([0, 0, WIDTH-1, HEIGHT-1], outline=0, width=3)
    
    # Title
    draw.text((WIDTH//2, 50), "CrossPoint Test", fill=0, font=font_large, anchor="mm")
    
    # Test pattern - checkerboard corners
    box_size = 40
    for i in range(4):
        for j in range(4):
            x = 20 + i * box_size
            y = 100 + j * box_size
            if (i + j) % 2 == 0:
                draw.rectangle([x, y, x + box_size, y + box_size], fill=0)
    
    # Right side checkerboard
    for i in range(4):
        for j in range(4):
            x = WIDTH - 180 + i * box_size
            y = 100 + j * box_size
            if (i + j) % 2 == 0:
                draw.rectangle([x, y, x + box_size, y + box_size], fill=0)
    
    # Center text
    draw.text((WIDTH//2, 180), "If you can read this,", fill=0, font=font_medium, anchor="mm")
    draw.text((WIDTH//2, 220), "upload is working!", fill=0, font=font_medium, anchor="mm")
    
    # Grayscale gradient bar
    gradient_y = 280
    gradient_height = 40
    for x in range(100, WIDTH - 100):
        gray = int((x - 100) / (WIDTH - 200) * 255)
        draw.line([(x, gradient_y), (x, gradient_y + gradient_height)], fill=gray)
    draw.text((WIDTH//2, gradient_y + gradient_height + 20), "Grayscale Test", fill=0, font=font_small, anchor="mm")
    
    # Timestamp
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    draw.text((WIDTH//2, HEIGHT - 50), f"Generated: {timestamp}", fill=0, font=font_small, anchor="mm")
    
    # Resolution info
    draw.text((WIDTH//2, HEIGHT - 25), f"Resolution: {WIDTH}x{HEIGHT}", fill=0, font=font_small, anchor="mm")
    
    # Save
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    img.save(output_path, 'BMP')
    print(f"✅ Test image created: {output_path}")
    print(f"   Size: {WIDTH}x{HEIGHT}")
    print(f"   Format: BMP (grayscale)")
    
    return output_path

if __name__ == '__main__':
    import sys
    output = sys.argv[1] if len(sys.argv) > 1 else "/tmp/crosspoint_test.bmp"
    create_test_image(output)
