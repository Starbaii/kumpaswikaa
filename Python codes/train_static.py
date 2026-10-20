# to run type train_static.py in the cmd
import os
import cv2
import numpy as np
import mediapipe as mp
import joblib

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

# Settings


DATASET_DIR = "Dataset"
MODEL_FILE = "fsl_static_model.pkl"
HAND_MODEL = "hand_landmarker.task"

NUM_HANDS = 2

LANDMARKS_PER_HAND = 21
VALUES_PER_LANDMARK = 3

FEATURES_PER_HAND = (
    LANDMARKS_PER_HAND * VALUES_PER_LANDMARK
)

FEATURES_PER_IMAGE = (
    FEATURES_PER_HAND * NUM_HANDS
)


# Check Files

if not os.path.exists(DATASET_DIR):
    print("ERROR: Dataset folder was not found.")
    exit()

if not os.path.exists(HAND_MODEL):
    print("ERROR: hand_landmarker.task was not found.")
    exit()



# Mediapipe


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
    running_mode=VisionRunningMode.IMAGE,
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



# Get Features of for the two hands


def extract_landmarks(image, detector):

    rgb_image = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2RGB
    )

    mp_image = mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=rgb_image
    )

    result = detector.detect(mp_image)

    if not result.hand_landmarks:
        return None

    hands = result.hand_landmarks

    left_hand = None
    right_hand = None


    
    # For identifying left and right hands
  

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


    
    # Left 
    

    features = []

    if left_hand is not None:

        features.extend(
            get_hand_features(left_hand)
        )

    else:

        features.extend(
            [0.0] * FEATURES_PER_HAND
        )


    # --------------------------------------------------------
    # RIGHT HAND
    # --------------------------------------------------------

    if right_hand is not None:

        features.extend(
            get_hand_features(right_hand)
        )

    else:

        features.extend(
            [0.0] * FEATURES_PER_HAND
        )


    return features



# Load Dataset


X = []
y = []

print()
print("========================================")
print("LOADING IMAGE DATASET")
print("========================================")


with HandLandmarker.create_from_options(
    options
) as detector:

    for label in sorted(
        os.listdir(DATASET_DIR)
    ):

        folder = os.path.join(
            DATASET_DIR,
            label
        )

        if not os.path.isdir(folder):
            continue

        print()
        print("Class:", label)

        total_images = 0
        valid_images = 0


        for filename in sorted(
            os.listdir(folder)
        ):

            if not filename.lower().endswith(
                (
                    ".jpg",
                    ".jpeg",
                    ".png",
                    ".webp"
                )
            ):
                continue

            image_path = os.path.join(
                folder,
                filename
            )

            image = cv2.imread(
                image_path
            )

            if image is None:
                print(
                    "Could not read:",
                    filename
                )
                continue

            total_images += 1

            features = extract_landmarks(
                image,
                detector
            )

            if features is None:

                print(
                    "No hand detected:",
                    filename
                )

                continue

            if len(features) != FEATURES_PER_IMAGE:

                print(
                    "Wrong feature size:",
                    filename
                )

                continue

            X.append(features)
            y.append(label)

            valid_images += 1


        print(
            f"Images: {total_images} | "
            f"Valid: {valid_images}"
        )



# Check Data


if len(X) == 0:

    print()
    print("ERROR: No valid training images found.")
    exit()


X = np.array(X)
y = np.array(y)


print()
print("========================================")
print("DATASET INFORMATION")
print("========================================")

print("Samples:", len(X))
print("Features:", X.shape[1])
print("Expected:", FEATURES_PER_IMAGE)
print("Classes:", sorted(set(y)))


# Check class counts


unique_classes, class_counts = np.unique(
    y,
    return_counts=True
)

print()
print("Class counts:")

for class_name, count in zip(
    unique_classes,
    class_counts
):

    print(
        f"  {class_name}: {count}"
    )


if len(unique_classes) < 2:

    print()
    print(
        "ERROR: You need at least 2 classes "
        "to train the classifier."
    )

    exit()


if np.min(class_counts) < 2:

    print()
    print(
        "ERROR: Every class needs at least "
        "2 images for the train/test split."
    )

    exit()


# Train or test split


X_train, X_test, y_train, y_test = (
    train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y
    )
)


print()
print("Training samples:", len(X_train))
print("Testing samples:", len(X_test))


# Train model


print()
print("Training static Random Forest model...")


model = RandomForestClassifier(
    n_estimators=300,
    random_state=42,
    n_jobs=-1
)


model.fit(
    X_train,
    y_train
)


# Test

predictions = model.predict(
    X_test
)


accuracy = accuracy_score(
    y_test,
    predictions
)


print()
print("========================================")
print("STATIC MODEL RESULTS")
print("========================================")

print(
    f"Accuracy: {accuracy * 100:.2f}%"
)

print()
print(
    classification_report(
        y_test,
        predictions,
        zero_division=0
    )
)


# Save

joblib.dump(
    model,
    MODEL_FILE
)


print()
print("========================================")
print("STATIC MODEL SAVED")
print("========================================")

print(
    "File:",
    MODEL_FILE
)

print(
    "Features:",
    FEATURES_PER_IMAGE
)

print("========================================")
