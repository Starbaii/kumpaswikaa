# to run type train_video.py in the cmd
import os
import cv2
import numpy as np
import mediapipe as mp
import joblib

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report


# Settings


VIDEO_DATASET_DIR = "VideoDataset"
MODEL_FILE = "fsl_video_model.pkl"
HAND_MODEL = "hand_landmarker.task"

NUM_HANDS = 2
SEQUENCE_LENGTH = 20

LANDMARKS_PER_HAND = 21
VALUES_PER_LANDMARK = 3

FEATURES_PER_HAND = LANDMARKS_PER_HAND * VALUES_PER_LANDMARK
FEATURES_PER_FRAME = FEATURES_PER_HAND * NUM_HANDS
FEATURES_PER_VIDEO = FEATURES_PER_FRAME * SEQUENCE_LENGTH


# Support video files mp4, mov


VIDEO_EXTENSIONS = (
    ".mp4",
    ".mov"
)


# Check folder and files


if not os.path.exists(VIDEO_DATASET_DIR):

    print("ERROR: VideoDataset folder was not found.")
    exit()


if not os.path.exists(HAND_MODEL):

    print("ERROR: hand_landmarker.task was not found.")
    print("Put hand_landmarker.task inside the Capstone folder.")
    exit()



# Mediapipe setup


BaseOptions = mp.tasks.BaseOptions

HandLandmarker = mp.tasks.vision.HandLandmarker

HandLandmarkerOptions = (
    mp.tasks.vision.HandLandmarkerOptions
)

VisionRunningMode = (
    mp.tasks.vision.RunningMode
)


options = HandLandmarkerOptions(

    base_options=BaseOptions(
        model_asset_path=HAND_MODEL
    ),

    running_mode=VisionRunningMode.VIDEO,

    num_hands=NUM_HANDS,

    min_hand_detection_confidence=0.5,

    min_hand_presence_confidence=0.5,

    min_tracking_confidence=0.5
)


# Get Features from one hand

def get_hand_features(hand):

    wrist = hand[0]

    features = []

    for landmark in hand:

        x = landmark.x - wrist.x
        y = landmark.y - wrist.y
        z = landmark.z - wrist.z

        features.extend([
            x,
            y,
            z
        ])

    return features


# ============================================================
# EXTRACT TWO-HAND FEATURES
# ============================================================

def extract_landmarks(
    image,
    detector,
    timestamp
):

    rgb_image = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2RGB
    )

    mp_image = mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=rgb_image
    )

    result = detector.detect_for_video(
        mp_image,
        timestamp
    )


    # No hand detected prompt

    if not result.hand_landmarks:

        return None


    hands = result.hand_landmarks

    left_hand = None
    right_hand = None


    # Left and Right hand detection

    if result.handedness:

        for i, handedness_list in enumerate(
            result.handedness
        ):

            if i >= len(hands):
                continue

            if not handedness_list:
                continue

            category = handedness_list[0]

            if category.category_name == "Left":

                left_hand = hands[i]

            elif category.category_name == "Right":

                right_hand = hands[i]


    # Fallback

    if left_hand is None and right_hand is None:

        if len(hands) >= 1:

            left_hand = hands[0]

        if len(hands) >= 2:

            right_hand = hands[1]


    features = []


    # Left Hand
    

    if left_hand is not None:

        features.extend(
            get_hand_features(left_hand)
        )

    else:

        features.extend(
            [0.0] * FEATURES_PER_HAND
        )


    # Right Hand

    if right_hand is not None:

        features.extend(
            get_hand_features(right_hand)
        )

    else:

        features.extend(
            [0.0] * FEATURES_PER_HAND
        )


    return features


# Process one video

def process_video(
    video_path,
    detector,
    timestamp_start
):

    cap = cv2.VideoCapture(
        video_path
    )


    if not cap.isOpened():

        print(
            "    ERROR: Could not open video."
        )

        return None, timestamp_start


    total_frames = int(
        cap.get(
            cv2.CAP_PROP_FRAME_COUNT
        )
    )


    fps = cap.get(
        cv2.CAP_PROP_FPS
    )


    if fps <= 0:

        fps = 30


    if total_frames <= 0:

        cap.release()

        print(
            "    ERROR: Video has no frames."
        )

        return None, timestamp_start


    # Select 20 frames evenly through the video

    frame_indices = np.linspace(
        0,
        total_frames - 1,
        SEQUENCE_LENGTH
    ).astype(int)


    sequence = []

    last_timestamp = timestamp_start


    for frame_index in frame_indices:

        cap.set(
            cv2.CAP_PROP_POS_FRAMES,
            int(frame_index)
        )


        success, frame = cap.read()


        if not success:

            print(
                f"    Could not read frame "
                f"{frame_index}"
            )

            continue


        # Timestamp

        video_timestamp = int(
            (frame_index / fps) * 1000
        )


        timestamp = (
            timestamp_start
            + video_timestamp
            + 1
        )


        # Make sure timestamps always increase

        if timestamp <= last_timestamp:

            timestamp = last_timestamp + 1


        last_timestamp = timestamp


        # Extract hand landmarks

        features = extract_landmarks(
            frame,
            detector,
            timestamp
        )


        # If no hand detected, skip this frame

        if features is None:

            continue


        if len(features) != FEATURES_PER_FRAME:

            continue


        sequence.append(
            features
        )


    cap.release()


    # Check num of valid frames

    if len(sequence) == 0:

        print(
            "    ERROR: No hands were detected."
        )

        video_duration = int(
            (total_frames / fps) * 1000
        )

        new_timestamp = (
            timestamp_start
            + video_duration
            + 1000
        )

        return None, new_timestamp


    # If fewer than 20 valid frames
    # Duplicate last valid frame


    while len(sequence) < SEQUENCE_LENGTH:

        sequence.append(
            sequence[-1].copy()
        )


    # Keep exactly 20 frames

    sequence = sequence[
        :SEQUENCE_LENGTH
    ]


    # CONVERT TO NUMPY

    sequence = np.array(
        sequence,
        dtype=np.float32
    )


    # FLATTEN
    #
    # 20 frames × 126 features
    # = 2520 features

    features = sequence.flatten()


    if len(features) != FEATURES_PER_VIDEO:

        print(
            "    ERROR: Incorrect feature count."
        )

        return None, timestamp_start


    # update timestamp

    video_duration = int(
        (total_frames / fps) * 1000
    )


    new_timestamp = (
        timestamp_start
        + video_duration
        + 1000
    )


    return features, new_timestamp


# Load Video Dataset

print()
print("========================================")
print("LOADING VIDEO DATASET")
print("========================================")
print()


X = []
y = []


# Used to prevent MediaPipe timestamp errors
# between different videos.

global_timestamp = 0


# Create hand landmaker

with HandLandmarker.create_from_options(
    options
) as detector:


    # --------------------------------------------------------
    # Find class folders
    # --------------------------------------------------------

    classes = sorted(
        os.listdir(
            VIDEO_DATASET_DIR
        )
    )


    for label in classes:

        folder = os.path.join(
            VIDEO_DATASET_DIR,
            label
        )


        if not os.path.isdir(folder):

            continue


        print(
            f"Class: {label}"
        )


        # ----------------------------------------------------
        # Find files
        # ----------------------------------------------------

        files = sorted(
            os.listdir(folder)
        )


        for filename in files:

            # ONLY mp4 and mov

            if not filename.lower().endswith(
                VIDEO_EXTENSIONS
            ):

                continue


            video_path = os.path.join(
                folder,
                filename
            )


            print(
                f"Processing: {filename}"
            )


            # Process video

            features, global_timestamp = process_video(
                video_path,
                detector,
                global_timestamp
            )


            # Check result

            if features is None:

                print(
                    f"Skipped: {filename}"
                )

                print()

                continue


            # Add training data

            X.append(
                features
            )

            y.append(
                label
            )


            print(
                f"Accepted: {filename}"
            )

            print(
                f"Features: {len(features)}"
            )

            print()


# Check Dataset

print("========================================")
print("DATASET SUMMARY")
print("========================================")
print()


if len(X) == 0:

    print(
        "ERROR: No valid MP4 or MOV videos were found."
    )

    print()
    print(
        "Make sure your videos are inside:"
    )

    print(
        "VideoDataset/<class_name>/"
    )

    print()

    exit()


X = np.array(
    X,
    dtype=np.float32
)

y = np.array(
    y
)


unique_classes, class_counts = np.unique(
    y,
    return_counts=True
)


print(
    f"Total videos: {len(X)}"
)

print(
    f"Number of classes: {len(unique_classes)}"
)

print(
    f"Features per video: {X.shape[1]}"
)

print()


print("Videos per class:")

for class_name, count in zip(
    unique_classes,
    class_counts
):

    print(
        f"  {class_name}: {count}"
    )


print()


# ============================================================
# CHECK NUMBER OF CLASSES
# ============================================================

if len(unique_classes) < 2:

    print(
        "ERROR: You need at least 2 classes."
    )

    exit()


# Check Minimum Videos

if np.min(class_counts) < 2:

    print()
    print(
        "ERROR: Every class needs at least "
        "2 videos."
    )

    print()

    print(
        "For example:"
    )

    print(
        "VideoDataset/"
    )

    print(
        "├── again/"
    )

    print(
        "│   ├── 1.mp4"
    )

    print(
        "│   └── 2.mov"
    )

    print(
        "│"
    )

    print(
        "└── card/"
    )

    print(
        "    ├── 1.mp4"
    )

    print(
        "    └── 2.mov"
    )

    exit()


# Train / Test Split

print("========================================")
print("SPLITTING DATA")
print("========================================")
print()


X_train, X_test, y_train, y_test = train_test_split(

    X,
    y,

    test_size=0.20,

    random_state=42,

    stratify=y
)


print(
    f"Training videos: {len(X_train)}"
)

print(
    f"Testing videos: {len(X_test)}"
)

print()


# Train random forest

print("========================================")
print("TRAINING VIDEO MODEL")
print("========================================")
print()


model = RandomForestClassifier(

    n_estimators=300,

    random_state=42,

    n_jobs=-1
)


model.fit(
    X_train,
    y_train
)


print(
    "Training finished."
)

print()


# Evaluate

print("========================================")
print("EVALUATING MODEL")
print("========================================")
print()


predictions = model.predict(
    X_test
)


accuracy = accuracy_score(
    y_test,
    predictions
)


print(
    f"Accuracy: {accuracy * 100:.2f}%"
)

print()


print(
    "Classification Report:"
)

print()


print(
    classification_report(
        y_test,
        predictions,
        zero_division=0
    )
)


# Save Model

joblib.dump(
    model,
    MODEL_FILE
)


print()
print("========================================")
print("TRAINING COMPLETE")
print("========================================")
print()


print(
    f"Model saved: {MODEL_FILE}"
)

print()


print(
    "You can now run:"
)

print(
    "python fsl_webcam.py"
)

print() 