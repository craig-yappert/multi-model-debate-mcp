#!/usr/bin/env python3
"""Quick bridge restart with error output"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

try:
    from dynamic_bridge import DynamicBridge
    print("Starting dynamic bridge...")
    bridge = DynamicBridge()
    bridge.run()
except Exception as e:
    print(f"Bridge error: {e}")
    import traceback
    traceback.print_exc()