"""
Standalone script to import movie scenes from minju dataset.
Can be run without Django management command.
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'CINEMATIC.settings')
django.setup()

from pathlib import Path
from app.models import Scene
from django.core.files import File
import re
import numpy as np
import cv2
from PIL import Image


def import_dataset():
    source_dir = Path(__file__).parent / 'app' / 'datasets' / 'minju'
    
    if not source_dir.exists():
        print(f'❌ Source directory not found: {source_dir}')
        return

    image_extensions = ('.jpg', '.jpeg', '.png', '.webp')
    image_files = [f for f in source_dir.iterdir() 
                  if f.is_file() and f.suffix.lower() in image_extensions]

    print(f'Found {len(image_files)} images in {source_dir.name}')
    print()

    imported = 0
    skipped = 0
    errors = 0

    for idx, image_path in enumerate(image_files, 1):
        try:
            filename = image_path.stem
            
            # Extract level from filename: "Title_N.ext"
            match = re.search(r'_(\d)$', filename)
            
            if not match:
                print(f'[{idx}/{len(image_files)}] Skipping {image_path.name}: no level found')
                skipped += 1
                continue
            
            level = int(match.group(1))
            
            if level < 1 or level > 9:
                print(f'[{idx}/{len(image_files)}] Skipping {image_path.name}: invalid level {level}')
                skipped += 1
                continue

            movie_title = filename[:match.start()].replace('_', ' ').strip()

            # Check if already exists
            if Scene.objects.filter(movie_title=movie_title, positivity_level=level).exists():
                print(f'[{idx}/{len(image_files)}] Skipping: {movie_title} (Level {level}) - already exists')
                skipped += 1
                continue

            # Create Scene
            scene = Scene(
                movie_title=movie_title,
                positivity_level=level
            )

            # Save image
            with open(image_path, 'rb') as img_file:
                scene.image.save(image_path.name, File(img_file), save=False)

            # Compute HSV
            try:
                img = Image.open(image_path)
                img_array = np.array(img.convert('RGB'))
                hsv = cv2.cvtColor(img_array, cv2.COLOR_RGB2HSV)
                
                h, s, v = hsv[:,:,0], hsv[:,:,1], hsv[:,:,2]
                mask = (s >= 30) & (v >= 30) & (v <= 225)
                
                if np.sum(mask) > 0:
                    scene.avg_s = float(np.mean(s[mask]))
                    scene.avg_v = float(np.mean(v[mask]))
                    h_360 = (h[mask].astype(float) * 2).astype(int)
                    hist, _ = np.histogram(h_360, bins=360, range=(0, 360))
                    scene.dom_h = int(np.argmax(hist))
                else:
                    scene.avg_s = float(np.mean(s))
                    scene.avg_v = float(np.mean(v))
                    scene.dom_h = 0
            except Exception as e:
                print(f'HSV computation failed for {image_path.name}: {e}')
                scene.avg_s = 128.0
                scene.avg_v = 128.0
                scene.dom_h = 0

            scene.save()
            
            print(f'OK [{idx}/{len(image_files)}] {movie_title} (Level {level})')
            imported += 1

        except Exception as e:
            print(f'ERROR [{idx}/{len(image_files)}] {image_path.name} - {e}')
            errors += 1

    print()
    print('=' * 50)
    print('Import Summary')
    print('=' * 50)
    print(f'Imported: {imported}')
    print(f'Skipped:  {skipped}')
    if errors > 0:
        print(f'Errors:   {errors}')
    print(f'Total:    {len(image_files)}')
    print('=' * 50)


if __name__ == '__main__':
    print('CINEMATIC Dataset Importer')
    print('=' * 50)
    print()
    
    try:
        import_dataset()
    except KeyboardInterrupt:
        print('\n\nImport cancelled by user')
    except Exception as e:
        print(f'\n\nFatal error: {e}')
        import traceback
        traceback.print_exc()

