# to run type fsl_translator.py
import os
import cv2
import numpy as np
import mediapipe as mp
import joblib

from collections import deque


# Settings

STATIC_MODEL_FILE = (
    "fsl_static_model.pkl"
)

VIDEO_MODEL_FILE = (
    "fsl_video_model.pkl"
)

HAND_MODEL = (
    "hand_landmarker.task"
)

NUM_HANDS = 2

SEQUENCE_LENGTH = 20

LANDMARKS_PER_HAND = 21

VALUES_PER_LANDMARK = 3

FEATURES_PER_HAND = (
    LANDMARKS_PER_HAND
    * VALUES_PER_LANDMARK
)

FEATURES_PER_FRAME = (
    FEATURES_PER_HAND
    * NUM_HANDS
)


# Check Files

if not os.path.exists(
    STATIC_MODEL_FILE
):

    print(
        "ERROR:",
        STATIC_MODEL_FILE,
        "not found."
    )

    print(
        "Run train_static.py first."
    )

    exit()


if not os.path.exists(
    VIDEO_MODEL_FILE
):

    print(
        "ERROR:",
        VIDEO_MODEL_FILE,
        "not found."
    )

    print(
        "Run train_video.py first."
    )

    exit()


if not os.path.exists(
    HAND_MODEL
):

    print(
        "ERROR:",
        HAND_MODEL,
        "not found."
    )

    exit()


# Load models

print(
    "Loading static model..."
)

static_model = joblib.load(
    STATIC_MODEL_FILE
)


print(
    "Loading video model..."
)

video_model = joblib.load(
    VIDEO_MODEL_FILE
)


print(
    "Models loaded successfully."
)


# Display Names of model data

DISPLAY_NAMES = {

    "A": "A",
    "B": "B",
    "C": "C",
    "D": "D",
    "E": "E",
    "F": "F",
    "G": "G",
    "H": "H",
    "I": "I",
    "J": "J",
    "K": "K",
    "L": "L",
    "M": "M",
    "N": "N",
    "O": "O",
    "P": "P",
    "Q": "Q",
    "R": "R",
    "S": "S",
    "T": "T",
    "U": "U",
    "V": "V",
    "W": "W",
    "X": "X",
    "Y": "Y",
    "Z": "Z",

    "I_Love_You": "I Love You",

    "Thank_You": "Thank You",

    "Good_Morning": "Good Morning",

    "Good_Afternoon": "Good Afternoon",

    "Good_Night": "Good Night"
}


# MediaPipe

BaseOptions = (
    mp.tasks.BaseOptions
)

HandLandmarker = (
    mp.tasks.vision.HandLandmarker
)

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

    running_mode=(
        VisionRunningMode.VIDEO
    ),

    num_hands=NUM_HANDS,

    min_hand_detection_confidence=0.5,

    min_hand_presence_confidence=0.5,

    min_tracking_confidence=0.5
)


# One Hand

def get_hand_features(hand):

    wrist = hand[0]

    features = []


    for landmark in hand:

        x = (
            landmark.x
            - wrist.x
        )

        y = (
            landmark.y
            - wrist.y
        )

        z = (
            landmark.z
            - wrist.z
        )


        features.extend([
            x,
            y,
            z
        ])


    return features


# Two hands


def extract_two_hand_features(
    result
):

    if not result.hand_landmarks:

        return (
            None,
            None,
            None
        )


    hands = result.hand_landmarks


    left_hand = None

    right_hand = None


    # Identify left and right hand

    if result.handedness:

        for i, handedness_list in enumerate(
            result.handedness
        ):

            if i >= len(hands):

                continue


            if not handedness_list:

                continue


            category = (
                handedness_list[0]
            )


            if (
                category.category_name
                == "Left"
            ):

                left_hand = hands[i]


            elif (
                category.category_name
                == "Right"
            ):

                right_hand = hands[i]


    # Fallback

    if (
        left_hand is None
        and right_hand is None
    ):

        if len(hands) >= 1:

            left_hand = hands[0]


        if len(hands) >= 2:

            right_hand = hands[1]


    features = []


    # Left Hand

    if left_hand is not None:

        features.extend(

            get_hand_features(
                left_hand
            )

        )

    else:

        features.extend(

            [0.0] * FEATURES_PER_HAND

        )


    # Right Hand

    if right_hand is not None:

        features.extend(

            get_hand_features(
                right_hand
            )

        )

    else:

        features.extend(

            [0.0] * FEATURES_PER_HAND

        )


    return (
        features,
        left_hand,
        right_hand
    )


# Hand Connections

HAND_CONNECTIONS = [

    (0, 1),
    (1, 2),
    (2, 3),
    (3, 4),

    (0, 5),
    (5, 6),
    (6, 7),
    (7, 8),

    (5, 9),
    (9, 10),
    (10, 11),
    (11, 12),

    (9, 13),
    (13, 14),
    (14, 15),
    (15, 16),

    (13, 17),
    (17, 18),
    (18, 19),
    (19, 20),

    (0, 17)
]


# Draw hand

def draw_hand(
    frame,
    hand
):

    height, width, _ = (
        frame.shape
    )


    points = []


    for landmark in hand:

        x = int(
            landmark.x * width
        )

        y = int(
            landmark.y * height
        )


        points.append(
            (x, y)
        )


        cv2.circle(

            frame,

            (x, y),

            5,

            (0, 255, 0),

            -1

        )


    for start, end in (
        HAND_CONNECTIONS
    ):

        cv2.line(

            frame,

            points[start],

            points[end],

            (255, 0, 0),

            2

        )


# Webcam

cap = cv2.VideoCapture(0)


if not cap.isOpened():

    print(
        "ERROR: Could not open webcam."
    )

    exit()


# Video Buffer

sequence_buffer = deque(

    maxlen=SEQUENCE_LENGTH

)


# Variables

static_prediction = (
    "Waiting..."
)

static_confidence = 0.0

video_prediction = (
    "Waiting..."
)

video_confidence = 0.0

timestamp_ms = 0


# Mediapipe

with HandLandmarker.create_from_options(
    options
) as detector:


    while True:


        # Camera frame

        success, frame = (
            cap.read()
        )


        if not success:

            print(
                "Could not read webcam."
            )

            break


        # Mirror
        frame = cv2.flip(
            frame,
            1
        )

        # Color of landmarks

        rgb_frame = cv2.cvtColor(

            frame,

            cv2.COLOR_BGR2RGB

        )


        mp_image = mp.Image(

            image_format=(
                mp.ImageFormat.SRGB
            ),

            data=rgb_frame

        )


        # Timestamp

        timestamp_ms += 33


        # Detect hands

        result = (
            detector.detect_for_video(

                mp_image,

                timestamp_ms

            )
        )


        # Hands Detection

        if result.hand_landmarks:


            (
                features,
                left_hand,
                right_hand
            ) = extract_two_hand_features(

                result

            )


            # Draw left hand

            if left_hand is not None:

                draw_hand(

                    frame,

                    left_hand

                )


            # Draw right hand

            if right_hand is not None:

                draw_hand(

                    frame,

                    right_hand

                )


            # Static Model

            static_input = np.array(

                [features]

            )


            static_prediction = (
                static_model.predict(

                    static_input

                )[0]
            )


            if hasattr(

                static_model,

                "predict_proba"

            ):


                probabilities = (
                    static_model.predict_proba(

                        static_input

                    )[0]
                )


                static_confidence = (
                    float(
                        np.max(
                            probabilities
                        )
                    )
                )

            # Video Buffer

            sequence_buffer.append(

                features

            )


            # Video Model

            if (
                len(sequence_buffer)
                == SEQUENCE_LENGTH
            ):


                video_input = (
                    np.array(
                        sequence_buffer
                    ).flatten()
                )


                video_input = np.array(

                    [video_input]

                )


                video_prediction = (
                    video_model.predict(

                        video_input

                    )[0]
                )


                if hasattr(

                    video_model,

                    "predict_proba"

                ):


                    probabilities = (
                        video_model.predict_proba(

                            video_input

                        )[0]
                    )


                    video_confidence = (
                        float(
                            np.max(
                                probabilities
                            )
                        )
                    )


            else:

                video_prediction = (
                    "Collecting frames..."
                )

                video_confidence = 0.0


        # No hand

        else:


            sequence_buffer.clear()


            static_prediction = (
                "No hand"
            )

            static_confidence = 0.0


            video_prediction = (
                "No hand"
            )

            video_confidence = 0.0


        # Display Names

        static_display = (
            DISPLAY_NAMES.get(

                static_prediction,

                static_prediction

            )
        )


        video_display = (
            DISPLAY_NAMES.get(

                video_prediction,

                video_prediction

            )
        )


        # Hand Count

        hand_count = len(

            result.hand_landmarks

        )


        # Static Result

        cv2.putText(

            frame,

            f"STATIC: {static_display}",

            (20, 40),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.8,

            (0, 255, 0),

            2

        )


        cv2.putText(

            frame,

            (
                f"Confidence: "
                f"{static_confidence * 100:.1f}%"
            ),

            (20, 70),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.6,

            (0, 255, 0),

            2

        )


        # Vid Result

        cv2.putText(

            frame,

            f"VIDEO: {video_display}",

            (20, 115),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.8,

            (255, 0, 0),

            2

        )


        cv2.putText(

            frame,

            (
                f"Confidence: "
                f"{video_confidence * 100:.1f}%"
            ),

            (20, 145),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.6,

            (255, 0, 0),

            2

        )


        # Hand Count

        cv2.putText(

            frame,

            f"Hands detected: "
            f"{hand_count}/2",

            (20, 185),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.6,

            (255, 255, 255),

            2

        )


        # Video buffer

        cv2.putText(

            frame,

            (
                f"Video frames: "
                f"{len(sequence_buffer)}/"
                f"{SEQUENCE_LENGTH}"
            ),

            (20, 220),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.6,

            (255, 255, 255),

            2

        )


        # EXIT

        cv2.putText(

            frame,

            "Press ESC to exit",

            (20, 255),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.6,

            (255, 255, 255),

            2

        )

        # Show

        cv2.imshow(

            "FSL Two-Hand Recognition",

            frame

        )


        # close

        key = (
            cv2.waitKey(1)
            & 0xFF
        )


        if key == 27:

            break


# 
# CLEANUP

cap.release()

cv2.destroyAllWindows()

print()
print("Program ended.")
