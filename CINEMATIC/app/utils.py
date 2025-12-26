import cv2
import numpy as np
from PIL import Image
import io


def extract_dominant_hue_palette(image_path, k=10):
    """
    이미지에서 주요 Hue 팔레트를 추출합니다.
    
    Parameters:
    -----------
    image_path : str
        이미지 파일 경로
    k : int
        추출할 색상 개수 (기본값: 10)
    
    Returns:
    --------
    list : [{"h": int, "s": float, "v": float}, ...] 형태의 팔레트
    """
    # 이미지 읽기
    img = Image.open(image_path)
    img_array = np.array(img)
    
    # RGB를 BGR로 변환 (OpenCV 형식)
    if len(img_array.shape) == 3 and img_array.shape[2] == 3:
        bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
    else:
        bgr = img_array
    
    # 크기 조정 (처리 속도 향상)
    max_w = 240
    h, w = bgr.shape[:2]
    scale = min(1, max_w / w)
    new_w = max(2, int(w * scale))
    new_h = max(2, int(h * scale))
    
    if scale < 1:
        bgr = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    
    # HSV 변환
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h_channel = hsv[:, :, 0]  # 0-179 범위
    s_channel = hsv[:, :, 1]  # 0-255 범위
    v_channel = hsv[:, :, 2]  # 0-255 범위
    
    # Detect achromatic colors (black, white, gray)
    total_pixels = hsv.shape[0] * hsv.shape[1]
    achromatic_colors = _detect_achromatic_colors(s_channel, v_channel, total_pixels)
    
    # Multi-pass extraction with relaxing thresholds
    picked = []
    
    # Pass 1: Strict thresholds (high saturation, clear colors)
    picked = _extract_with_thresholds(
        h_channel, s_channel, v_channel, 
        s_min=0.25, v_min=0.15, v_max=0.95,
        min_dist=20, pixel_threshold_ratio=0.005, 
        target_count=k
    )
    
    # Pass 2: If not enough, relax saturation threshold
    if len(picked) < k:
        print(f"  → Pass 2: Relaxing saturation threshold (found {len(picked)}/{k})")
        picked = _extract_with_thresholds(
            h_channel, s_channel, v_channel,
            s_min=0.15, v_min=0.12, v_max=0.96,
            min_dist=18, pixel_threshold_ratio=0.003,
            target_count=k
        )
    
    # Pass 3: If still not enough, further relax
    if len(picked) < k:
        print(f"  → Pass 3: Further relaxing thresholds (found {len(picked)}/{k})")
        picked = _extract_with_thresholds(
            h_channel, s_channel, v_channel,
            s_min=0.10, v_min=0.10, v_max=0.97,
            min_dist=15, pixel_threshold_ratio=0.001,
            target_count=k
        )
    
    # Pass 4: Last resort - very relaxed thresholds
    if len(picked) < max(5, k // 2):  # At least 5 or half of target
        print(f"  → Pass 4: Maximum relaxation (found {len(picked)}/{k})")
        picked = _extract_with_thresholds(
            h_channel, s_channel, v_channel,
            s_min=0.05, v_min=0.08, v_max=0.98,
            min_dist=12, pixel_threshold_ratio=0.0005,
            target_count=k
        )
    
    # Hue 순으로 정렬
    picked.sort()
    
    # HSV 팔레트 생성 (chromatic colors)
    palette = [{"h": h, "s": 0.58, "v": 0.70} for h in picked]
    
    # Add achromatic colors if they are significant
    # Use special negative Hue values to mark achromatic colors
    remaining_slots = k - len(palette)
    
    print(f"  Checking achromatic colors for inclusion (need >{5.0}% of image):")
    for achro_type, ratio, sv_values in achromatic_colors:
        if remaining_slots <= 0:
            print(f"    {achro_type.capitalize()}: {ratio*100:.1f}% (skipped - no slots)")
            break
        
        # Include if > 5% of image (lowered from 10%)
        if ratio > 0.05:
            if achro_type == "white":
                # Use actual average value for more accurate white representation
                actual_v = sv_values[1]
                palette.append({"h": -1, "s": 0.0, "v": max(0.85, actual_v)})
                print(f"  ✓ Added White: {ratio*100:.1f}% of image (avg V: {actual_v:.2f})")
            elif achro_type == "black":
                # Use actual average value for more accurate black representation
                actual_v = sv_values[1]
                palette.append({"h": -2, "s": 0.0, "v": min(0.20, actual_v)})
                print(f"  ✓ Added Black: {ratio*100:.1f}% of image (avg V: {actual_v:.2f})")
            elif achro_type == "gray":
                # Use actual average value for more accurate gray representation
                actual_v = sv_values[1]
                palette.append({"h": -3, "s": 0.0, "v": actual_v})
                print(f"  ✓ Added Gray: {ratio*100:.1f}% of image (avg V: {actual_v:.2f})")
            remaining_slots -= 1
        else:
            print(f"    {achro_type.capitalize()}: {ratio*100:.1f}% (below threshold)")
    
    print(f"✓ Final palette: {len(palette)} colors extracted ({len([p for p in palette if p['h'] >= 0])} chromatic + {len([p for p in palette if p['h'] < 0])} achromatic)")
    
    return palette


def _detect_achromatic_colors(s_channel, v_channel, total_pixels):
    """
    Detect achromatic colors (white, black, gray) in the image
    
    Returns:
    --------
    list : [(type, ratio, (s_avg, v_avg)), ...] sorted by ratio descending
    """
    white_count = 0
    black_count = 0
    gray_count = 0
    
    white_v_sum = 0.0
    black_v_sum = 0.0
    gray_v_sum = 0.0
    
    for y in range(s_channel.shape[0]):
        for x in range(s_channel.shape[1]):
            s = s_channel[y, x] / 255.0
            v = v_channel[y, x] / 255.0
            
            # Achromatic: low saturation (relaxed threshold)
            if s < 0.20:  # Increased from 0.15 to catch slightly colored darks
                if v > 0.70:  # White (bright) - lowered from 0.75
                    white_count += 1
                    white_v_sum += v
                elif v < 0.35:  # Black (dark) - increased from 0.25 to catch more darks
                    black_count += 1
                    black_v_sum += v
                elif 0.35 <= v <= 0.70:  # Gray (medium)
                    gray_count += 1
                    gray_v_sum += v
    
    results = []
    
    if white_count > 0:
        white_ratio = white_count / total_pixels
        white_v_avg = white_v_sum / white_count
        results.append(("white", white_ratio, (0.0, white_v_avg)))
        print(f"  Achromatic detected - White: {white_count} pixels ({white_ratio*100:.1f}%)")
    
    if black_count > 0:
        black_ratio = black_count / total_pixels
        black_v_avg = black_v_sum / black_count
        results.append(("black", black_ratio, (0.0, black_v_avg)))
        print(f"  Achromatic detected - Black: {black_count} pixels ({black_ratio*100:.1f}%)")
    
    if gray_count > 0:
        gray_ratio = gray_count / total_pixels
        gray_v_avg = gray_v_sum / gray_count
        results.append(("gray", gray_ratio, (0.0, gray_v_avg)))
        print(f"  Achromatic detected - Gray: {gray_count} pixels ({gray_ratio*100:.1f}%)")
    
    # Sort by ratio (most prominent first)
    results.sort(key=lambda x: x[1], reverse=True)
    
    return results


def _extract_with_thresholds(h_channel, s_channel, v_channel, s_min, v_min, v_max, 
                              min_dist, pixel_threshold_ratio, target_count):
    """
    Helper function to extract colors with specific thresholds
    """
    bins = np.zeros(360, dtype=np.float32)
    pixel_counts = np.zeros(360, dtype=np.int32)
    total_valid_pixels = 0
    
    for y in range(h_channel.shape[0]):
        for x in range(h_channel.shape[1]):
            h = int(h_channel[y, x] * 2)  # 0-179 -> 0-358
            s = s_channel[y, x] / 255.0
            v = v_channel[y, x] / 255.0
            
            # Apply thresholds
            if s < s_min or v < v_min or v > v_max:
                continue
            
            # Enhanced weighting
            saturation_weight = s * s
            value_weight = v * (1.0 - abs(v - 0.5) * 0.3)
            
            weight = saturation_weight * value_weight * 100
            bins[h] += weight
            pixel_counts[h] += 1
            total_valid_pixels += 1
    
    if total_valid_pixels == 0:
        print(f"  ⚠ No valid pixels with s>={s_min}, v>={v_min}")
        return []
    
    print(f"  Valid pixels: {total_valid_pixels} ({total_valid_pixels/(h_channel.shape[0] * h_channel.shape[1])*100:.1f}%)")
    
    # Dynamic pixel threshold
    min_pixel_threshold = max(3, int(total_valid_pixels * pixel_threshold_ratio))
    
    # Pick colors
    picked = []
    used = np.zeros(360, dtype=bool)
    
    for i in range(target_count):
        best_h = -1
        best_v = -1
        
        for h in range(360):
            if used[h]:
                continue
            
            if pixel_counts[h] < min_pixel_threshold:
                continue
            
            if bins[h] > best_v:
                best_v = bins[h]
                best_h = h
        
        if best_h < 0 or best_v <= 0:
            break
        
        print(f"    Color {i+1}: Hue {best_h}° ({pixel_counts[best_h]} px, weight: {best_v:.1f})")
        
        picked.append(best_h)
        
        # Mark surrounding colors
        for d in range(-min_dist, min_dist + 1):
            idx = (best_h + d + 360) % 360
            used[idx] = True
    
    return picked


def compute_hsv_summary(image_path):
    """
    이미지의 HSV 요약 정보를 계산합니다.
    
    Parameters:
    -----------
    image_path : str
        이미지 파일 경로
    
    Returns:
    --------
    dict : {"avgS": float, "avgV": float, "domH": int}
    """
    # 이미지 읽기
    img = Image.open(image_path)
    img_array = np.array(img)
    
    # RGB를 BGR로 변환
    if len(img_array.shape) == 3 and img_array.shape[2] == 3:
        bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
    else:
        bgr = img_array
    
    # 크기 조정
    max_w = 260
    h, w = bgr.shape[:2]
    scale = min(1, max_w / w)
    new_w = max(2, int(w * scale))
    new_h = max(2, int(h * scale))
    
    if scale < 1:
        bgr = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    
    # HSV 변환
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h_channel = hsv[:, :, 0]
    s_channel = hsv[:, :, 1] / 255.0  # 0-1 범위로 정규화
    v_channel = hsv[:, :, 2] / 255.0  # 0-1 범위로 정규화
    
    # 샘플링 (그리드 방식)
    step = max(1, int(min(new_w, new_h) / 90))
    
    s_sum = 0.0
    v_sum = 0.0
    cnt = 0
    hue_bins = np.zeros(360, dtype=np.float32)
    
    for y in range(0, new_h, step):
        for x in range(0, new_w, step):
            s = s_channel[y, x]
            v = v_channel[y, x]
            h = int(h_channel[y, x] * 2)  # 0-179 -> 0-358
            
            # 너무 어두운 픽셀 제외
            if v < 0.08:
                continue
            
            s_sum += s
            v_sum += v
            cnt += 1
            
            # Hue 히스토그램 가중치
            weight = (0.3 + s) * (0.3 + v)
            hue_bins[h] += weight
    
    # 평균 계산
    avg_s = s_sum / cnt if cnt > 0 else 0.0
    avg_v = v_sum / cnt if cnt > 0 else 0.0
    
    # 주요 Hue 찾기
    dom_h = int(np.argmax(hue_bins))
    
    return {
        "avgS": float(avg_s),
        "avgV": float(avg_v),
        "domH": int(dom_h)
    }


def get_aggregates_by_level(scenes_queryset):
    """
    긍부정도별로 HSV 통계를 집계합니다.
    
    Parameters:
    -----------
    scenes_queryset : QuerySet
        Scene 모델의 QuerySet
    
    Returns:
    --------
    dict : {1: {"count": int, "sMin": float, "sMax": float, ...}, ...}
    """
    aggregates = {}
    
    # 초기화
    for level in range(1, 10):
        aggregates[level] = {
            "count": 0,
            "sMin": None,
            "sMax": None,
            "vMin": None,
            "vMax": None,
            "sSum": 0.0,
            "vSum": 0.0,
            "sAvg": None,
            "vAvg": None
        }
    
    # 데이터 집계
    for scene in scenes_queryset:
        level = scene.positivity_level
        if level < 1 or level > 9:
            continue
        
        agg = aggregates[level]
        agg["count"] += 1
        
        s = scene.avg_s
        v = scene.avg_v
        
        if s is not None:
            if agg["sMin"] is None or s < agg["sMin"]:
                agg["sMin"] = s
            if agg["sMax"] is None or s > agg["sMax"]:
                agg["sMax"] = s
            agg["sSum"] += s
        
        if v is not None:
            if agg["vMin"] is None or v < agg["vMin"]:
                agg["vMin"] = v
            if agg["vMax"] is None or v > agg["vMax"]:
                agg["vMax"] = v
            agg["vSum"] += v
    
    # 평균 계산
    for level in range(1, 10):
        agg = aggregates[level]
        if agg["count"] > 0:
            if agg["sSum"] > 0:
                agg["sAvg"] = agg["sSum"] / agg["count"]
            if agg["vSum"] > 0:
                agg["vAvg"] = agg["vSum"] / agg["count"]
        else:
            # 데이터가 없으면 None으로 설정
            agg["sMin"] = None
            agg["sMax"] = None
            agg["vMin"] = None
            agg["vMax"] = None
    
    return aggregates

