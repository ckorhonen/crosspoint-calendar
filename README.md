# CrossPoint Calendar Display

Automated calendar and weather display for CrossPoint/Xteink X4 e-ink reader.

## Phase 0: Device Validation

### Device Info
- **IP**: 192.168.62.101 (configured)
- **Port**: TBD
- **Protocol**: TBD

### Quick Test
```bash
# Test connectivity
ping 192.168.62.101

# Create test image
python3 generator/create_test_image.py

# Upload to device
python3 generator/test_upload.py 192.168.62.101 /tmp/crosspoint_test.bmp
```

## Status
- [ ] Device connectivity confirmed
- [ ] Upload protocol discovered
- [ ] Test image displayed successfully
