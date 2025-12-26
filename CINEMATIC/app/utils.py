import cv2
import numpy as np
from PIL import Image
import io


def extract_dominant_hue_palette(image_path, k=8):
    """
    이미지에서 주요 Hue 팔레트를 추출합니다.
    
    Parameters:
    -----------
    image_path : str
        이미지 파일 경로
    k : int
        추출할 색상 개수 (기본값: 8)
    
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
    
    # Hue 히스토그램 (0-359도 범위로 변환)
    bins = np.zeros(360, dtype=np.float32)
    
    for y in range(hsv.shape[0]):
        for x in range(hsv.shape[1]):
            h = int(h_channel[y, x] * 2)  # 0-179 -> 0-358
            s = s_channel[y, x] / 255.0
            v = v_channel[y, x] / 255.0
            
            # 무채색 픽셀 제외
            if s < 0.12 or v < 0.10:
                continue
            
            # 가중치 적용
            weight = (0.4 + s) * (0.35 + v)
            bins[h] += weight
    
    # 상위 k개 색상 선택 (최소 거리 유지)
    picked = []
    used = np.zeros(360, dtype=bool)
    min_dist = 18
    
    for _ in range(k):
        best_h = -1
        best_v = -1
        
        for h in range(360):
            if used[h]:
                continue
            if bins[h] > best_v:
                best_v = bins[h]
                best_h = h
        
        if best_h < 0 or best_v <= 0:
            break
        
        picked.append(best_h)
        
        # 주변 색상 마킹
        for d in range(-min_dist, min_dist + 1):
            idx = (best_h + d + 360) % 360
            used[idx] = True
    
    # Hue 순으로 정렬
    picked.sort()
    
    # HSV 팔레트 생성
    palette = [{"h": h, "s": 0.58, "v": 0.70} for h in picked]
    
    return palette


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

