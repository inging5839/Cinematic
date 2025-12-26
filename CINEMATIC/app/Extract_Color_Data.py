import cv2
import numpy as np
import os
import matplotlib.pyplot as plt
from collections import defaultdict

source_dir = "datasets/minju"

files = sorted(
    os.listdir(source_dir),
    key=lambda x: os.path.splitext(x)[0][-1]  # 확장자 제거 후 마지막 글자(점수)
)[:1005]

score_data = defaultdict(lambda: {'h': [], 's': [], 'v': []})

# Saturation과 Value 임계값 설정 (이 값보다 낮으면 Hue가 의미 없음)
SATURATION_THRESHOLD = 30  # Saturation이 30보다 낮으면 무채색에 가까움
VALUE_THRESHOLD = 30       # Value가 30보다 낮으면 너무 어두워서 색상 구분 어려움

def circular_mean_hue(h_values):
    """
    Hue의 원형 평균을 계산합니다 (0도 = 360도 처리).
    
    Parameters:
    -----------
    h_values : np.ndarray
        Hue 값 배열 (OpenCV 범위: 0-179, 또는 이미 0-360도로 변환된 값)
    
    Returns:
    --------
    float : 원형 평균 Hue 값 (0-360도)
    """
    if len(h_values) == 0:
        return 0.0
    
    # OpenCV Hue 범위 (0-179)를 0-360도로 변환
    h_degrees = h_values * 2.0  # 0-179 -> 0-358도
    
    # 라디안으로 변환
    h_rad = np.deg2rad(h_degrees)
    
    # 원형 평균 계산: sin과 cos의 평균을 사용
    mean_sin = np.mean(np.sin(h_rad))
    mean_cos = np.mean(np.cos(h_rad))
    
    # arctan2로 평균 각도 계산 (라디안)
    mean_rad = np.arctan2(mean_sin, mean_cos)
    
    # 0-360도 범위로 변환
    mean_deg = np.rad2deg(mean_rad) % 360.0
    
    return mean_deg

excluded_count = 0
included_count = 0

for file in files:
    img = cv2.imread(f"{source_dir}/{file}")
    if img is None:
        continue
        
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    
    # 각 픽셀에서 Saturation과 Value가 임계값 이상인 픽셀만 선택
    valid_mask = (s >= SATURATION_THRESHOLD) & (v >= VALUE_THRESHOLD)
    
    # 유효한 픽셀만으로 평균 계산
    if np.sum(valid_mask) > 0:
        # Hue는 원형 평균 사용
        h_mean = circular_mean_hue(h[valid_mask])
        s_mean = np.mean(s)
        v_mean = np.mean(v)
        
        # 전체 픽셀 대비 유효 픽셀 비율
        valid_ratio = np.sum(valid_mask) / valid_mask.size
        
        score = os.path.splitext(file)[0][-1]

        score_data[score]['h'].append(h_mean)
        score_data[score]['s'].append(s_mean)
        score_data[score]['v'].append(v_mean)
        
        included_count += 1
        print(f"{h_mean:.2f} {s_mean:.2f} {v_mean:.2f} {score} (valid pixels: {valid_ratio*100:.1f}%)")
    else:
        # 유효한 픽셀이 하나도 없는 경우
        excluded_count += 1
        print(f"EXCLUDED: {file} - No valid pixels (all pixels have S < {SATURATION_THRESHOLD} or V < {VALUE_THRESHOLD})")

print(f"\n{'='*60}")
print(f"Filtering Summary:")
print(f"  Included: {included_count} images")
print(f"  Excluded: {excluded_count} images (no valid pixels)")
print(f"  Total: {included_count + excluded_count} images")
print(f"  Pixel filtering: S >= {SATURATION_THRESHOLD} and V >= {VALUE_THRESHOLD}")
print(f"  Hue calculation: Circular mean (0° = 360°)")
print(f"{'='*60}\n")

# 점수별 HSV 값 시각화
def visualize_hsv_by_score(score_data):
    """점수별 HSV 값을 시각화합니다."""
    # 점수를 숫자로 변환하여 정렬
    sorted_scores = sorted(score_data.keys(), key=lambda x: int(x) if x.isdigit() else 999)
    
    if not sorted_scores:
        print("No data to visualize")
        return
    
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('HSV Values by Score', fontsize=16, fontweight='bold')
    
    # 점수별 평균 HSV 값 계산
    score_means = {}
    for score in sorted_scores:
        if len(score_data[score]['h']) > 0:
            # Hue는 원형 평균 사용 (이미 0-360도 범위로 저장되어 있음)
            h_array = np.array(score_data[score]['h'])
            # 0-360도 범위를 0-179 범위로 변환 (OpenCV 형식)
            h_opencv_range = h_array / 2.0
            h_circular_mean = circular_mean_hue(h_opencv_range)
            
            score_means[score] = {
                'h_mean': h_circular_mean,
                's_mean': np.mean(score_data[score]['s']),
                'v_mean': np.mean(score_data[score]['v']),
                'h_std': np.std(score_data[score]['h']),
                's_std': np.std(score_data[score]['s']),
                'v_std': np.std(score_data[score]['v']),
                'count': len(score_data[score]['h'])
            }
    
    scores = list(score_means.keys())
    h_means = [score_means[s]['h_mean'] for s in scores]
    s_means = [score_means[s]['s_mean'] for s in scores]
    v_means = [score_means[s]['v_mean'] for s in scores]
    h_stds = [score_means[s]['h_std'] for s in scores]
    s_stds = [score_means[s]['s_std'] for s in scores]
    v_stds = [score_means[s]['v_std'] for s in scores]
    
    # 1. H 평균 비교 (바 차트)
    ax = axes[0, 0]
    x_pos = np.arange(len(scores))
    bars = ax.bar(x_pos, h_means, yerr=h_stds, capsize=5, color='red', alpha=0.7, edgecolor='black')
    ax.set_xlabel('Score')
    ax.set_ylabel('H Mean (degrees)')
    ax.set_title('Hue Mean by Score')
    ax.set_xticks(x_pos)
    ax.set_xticklabels(scores)
    ax.grid(True, alpha=0.3, axis='y')
    # 값 표시
    for i, (bar, mean, std) in enumerate(zip(bars, h_means, h_stds)):
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + std,
               f'{mean:.1f}',
               ha='center', va='bottom', fontsize=8)
    
    # 2. S 평균 비교
    ax = axes[0, 1]
    bars = ax.bar(x_pos, s_means, yerr=s_stds, capsize=5, color='green', alpha=0.7, edgecolor='black')
    ax.set_xlabel('Score')
    ax.set_ylabel('S Mean')
    ax.set_title('Saturation Mean by Score')
    ax.set_xticks(x_pos)
    ax.set_xticklabels(scores)
    ax.grid(True, alpha=0.3, axis='y')
    for i, (bar, mean, std) in enumerate(zip(bars, s_means, s_stds)):
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + std,
               f'{mean:.1f}',
               ha='center', va='bottom', fontsize=8)
    
    # 3. V 평균 비교
    ax = axes[1, 0]
    bars = ax.bar(x_pos, v_means, yerr=v_stds, capsize=5, color='blue', alpha=0.7, edgecolor='black')
    ax.set_xlabel('Score')
    ax.set_ylabel('V Mean')
    ax.set_title('Value Mean by Score')
    ax.set_xticks(x_pos)
    ax.set_xticklabels(scores)
    ax.grid(True, alpha=0.3, axis='y')
    for i, (bar, mean, std) in enumerate(zip(bars, v_means, v_stds)):
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + std,
               f'{mean:.1f}',
               ha='center', va='bottom', fontsize=8)
    
    # 4. 점수별 분포 (박스플롯)
    ax = axes[1, 1]
    h_data = [score_data[s]['h'] for s in scores]
    bp = ax.boxplot(h_data, labels=scores, patch_artist=True)
    for patch in bp['boxes']:
        patch.set_facecolor('lightcoral')
        patch.set_alpha(0.7)
    ax.set_xlabel('Score')
    ax.set_ylabel('H Mean (degrees)')
    ax.set_title('Hue Distribution by Score (Boxplot)')
    ax.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    return fig

# 시각화 실행
if score_data:
    fig = visualize_hsv_by_score(score_data)
    plt.show()
    
    # 통계 요약 출력
    print("\n" + "="*60)
    print("HSV Statistics by Score")
    print("="*60)
    sorted_scores = sorted(score_data.keys(), key=lambda x: int(x) if x.isdigit() else 999)
    for score in sorted_scores:
        if len(score_data[score]['h']) > 0:
            h_array = np.array(score_data[score]['h'])
            # 0-360도 범위를 0-179 범위로 변환 후 원형 평균 계산
            h_opencv_range = h_array / 2.0
            h_circular_mean = circular_mean_hue(h_opencv_range)
            
            print(f"\nScore: {score} (n={len(score_data[score]['h'])})")
            print(f"  H Mean (circular): {h_circular_mean:.2f}° ± {np.std(score_data[score]['h']):.2f}°")
            print(f"  S Mean: {np.mean(score_data[score]['s']):.2f} ± {np.std(score_data[score]['s']):.2f}")
            print(f"  V Mean: {np.mean(score_data[score]['v']):.2f} ± {np.std(score_data[score]['v']):.2f}")
