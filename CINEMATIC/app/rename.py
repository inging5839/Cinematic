import os

source_dir = "datasets/minju"

files = os.listdir(source_dir)

for file in files:
    old_path = os.path.join(source_dir, file)

    new_name = file[5:]
    new_path = os.path.join(source_dir, new_name)

    # 같은 이름이 이미 있으면 숫자 붙이기
    if os.path.exists(new_path):
        count = 1
        while True:
            numbered_name = f"{count}_{new_name}"
            numbered_path = os.path.join(source_dir, numbered_name)

            if not os.path.exists(numbered_path):
                new_path = numbered_path
                break

            count += 1

    os.rename(old_path, new_path)
