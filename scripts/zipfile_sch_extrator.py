import os
from pathlib import Path
import shutil


def extract_kicad_schematics(source_dir, output_dir):
    source_path = Path(source_dir)
    output_path = Path(output_dir)

    # Create output directory if it doesn't exist
    output_path.mkdir(parents=True, exist_ok=True)

    for root, dirs, files in os.walk(source_path):
        root_path = Path(root)

        for file in files:
            if file.lower().endswith(".kicad_sch"):
                file_path = root_path / file

                # Use parent folder name as new file name
                parent_folder_name = root_path.name
                new_file_name = f"{parent_folder_name}.kicad_sch"
                destination = output_path / new_file_name

                # Handle duplicate names
                counter = 1
                while destination.exists():
                    destination = output_path / \
                        f"{parent_folder_name}_{counter}.kicad_sch"
                    counter += 1

                shutil.copy2(file_path, destination)
                print(f"Copied: {file_path} -> {destination}")


if __name__ == "__main__":
    source_directory = r"C:\Users\capis\Downloads\KiCad-Simulations-main\KiCad-Simulations-main"
    output_directory = r"C:\Users\capis\Downloads\KiCad-Simulations-main\seed_schematics"

    extract_kicad_schematics(source_directory, output_directory)
