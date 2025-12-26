"""
Django management command to import movie scene images from minju dataset.
Usage: python manage.py import_minju_dataset
"""
import os
import re
import shutil
from pathlib import Path
from django.core.management.base import BaseCommand
from django.core.files import File
from django.conf import settings
from app.models import Scene
from app.utils import compute_hsv_summary


class Command(BaseCommand):
    help = 'Import movie scene images from datasets/minju folder'

    def handle(self, *args, **options):
        # Source directory
        source_dir = Path(settings.BASE_DIR) / 'app' / 'datasets' / 'minju'
        
        if not source_dir.exists():
            self.stdout.write(self.style.ERROR(f'Source directory not found: {source_dir}'))
            return

        # Get all image files
        image_extensions = ('.jpg', '.jpeg', '.png', '.webp')
        image_files = [f for f in source_dir.iterdir() 
                      if f.is_file() and f.suffix.lower() in image_extensions]

        self.stdout.write(self.style.SUCCESS(f'Found {len(image_files)} images'))

        imported = 0
        skipped = 0
        errors = 0

        for image_path in image_files:
            try:
                # Parse filename: "Movie Title_Level.ext"
                filename = image_path.stem  # without extension
                
                # Extract level (positivity) from filename
                # Pattern: ends with _N where N is 1-9
                match = re.search(r'_(\d)$', filename)
                
                if not match:
                    self.stdout.write(self.style.WARNING(f'Skipping {image_path.name}: no level found'))
                    skipped += 1
                    continue
                
                level = int(match.group(1))
                
                if level < 1 or level > 9:
                    self.stdout.write(self.style.WARNING(
                        f'Skipping {image_path.name}: invalid level {level}'))
                    skipped += 1
                    continue

                # Extract movie title (everything before _N)
                movie_title = filename[:match.start()].replace('_', ' ').strip()

                # Check if already exists
                if Scene.objects.filter(
                    movie_title=movie_title, 
                    positivity_level=level
                ).exists():
                    self.stdout.write(self.style.WARNING(
                        f'Skipping {image_path.name}: already exists'))
                    skipped += 1
                    continue

                # Create Scene object
                scene = Scene(
                    movie_title=movie_title,
                    positivity_level=level
                )

                # Copy image to media folder
                with open(image_path, 'rb') as img_file:
                    scene.image.save(
                        image_path.name,
                        File(img_file),
                        save=False
                    )

                # Compute HSV summary
                try:
                    from PIL import Image
                    import numpy as np
                    import cv2
                    
                    # Load image
                    img = Image.open(image_path)
                    img_array = np.array(img.convert('RGB'))
                    
                    # Convert to HSV
                    hsv = cv2.cvtColor(img_array, cv2.COLOR_RGB2HSV)
                    
                    # Compute averages (excluding black/white pixels)
                    h, s, v = hsv[:,:,0], hsv[:,:,1], hsv[:,:,2]
                    
                    # Filter out low saturation/value pixels
                    mask = (s >= 30) & (v >= 30) & (v <= 225)
                    
                    if np.sum(mask) > 0:
                        scene.avg_s = float(np.mean(s[mask]))
                        scene.avg_v = float(np.mean(v[mask]))
                        
                        # Dominant hue (convert to 0-359)
                        h_360 = (h[mask].astype(float) * 2).astype(int)
                        hist, _ = np.histogram(h_360, bins=360, range=(0, 360))
                        scene.dom_h = int(np.argmax(hist))
                    else:
                        # Fallback
                        scene.avg_s = float(np.mean(s))
                        scene.avg_v = float(np.mean(v))
                        scene.dom_h = 0
                        
                except Exception as e:
                    self.stdout.write(self.style.WARNING(
                        f'Could not compute HSV for {image_path.name}: {e}'))
                    scene.avg_s = 128.0
                    scene.avg_v = 128.0
                    scene.dom_h = 0

                scene.save()
                
                self.stdout.write(self.style.SUCCESS(
                    f'✓ Imported: {movie_title} (Level {level})'))
                imported += 1

            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f'Error importing {image_path.name}: {e}'))
                errors += 1

        # Summary
        self.stdout.write(self.style.SUCCESS(f'\n=== Import Summary ==='))
        self.stdout.write(self.style.SUCCESS(f'Imported: {imported}'))
        self.stdout.write(self.style.WARNING(f'Skipped: {skipped}'))
        if errors > 0:
            self.stdout.write(self.style.ERROR(f'Errors: {errors}'))
        self.stdout.write(self.style.SUCCESS(f'Total processed: {len(image_files)}'))

