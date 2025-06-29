# START OF FILE yolo_utils.py

import cv2
import numpy as np
import torch
import pandas as pd

# CẢI TIẾN: Danh sách các màu BGR được định nghĩa trước để gán cho các lớp
PREDEFINED_COLORS = [
    (0, 0, 255),    # Red
    (0, 255, 0),    # Green
    (255, 0, 0),    # Blue
    (0, 255, 255),  # Yellow
    (255, 0, 255),  # Magenta
    (255, 255, 0),  # Cyan
    (0, 165, 255),  # Orange
    (128, 0, 128),  # Purple
]

class YOLODetector:
    def __init__(self, model_path):
        """
        Initialize YOLOv5 detector with pre-trained model using torch.hub
        
        Args:
            model_path (str): Path to the YOLOv5 model file (best.pt)
        """
        try:
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            print(f"🚀 Using device: {self.device}")

            self.model = torch.hub.load('ultralytics/yolov5', 'custom', path=model_path, force_reload=False)
            self.model.to(self.device)
            
            self.confidence_threshold = 0.5
            self.class_names = self.model.names
            
            # CẢI TIẾN HỆ THỐNG MÀU SẮC: Tự động gán màu cho mỗi lớp
            self.colors = {}
            for i, class_name in enumerate(self.class_names.values()):
                self.colors[class_name] = PREDEFINED_COLORS[i % len(PREDEFINED_COLORS)]
            
            print(f"✅ YOLOv5 model loaded: {model_path}")
            print(f"📊 Model classes: {self.class_names}")
            print(f"🎨 Assigned colors: {self.colors}")
            print(f"🎯 Confidence threshold: {self.confidence_threshold}")
        except Exception as e:
            raise RuntimeError(f"Error loading YOLOv5 model: {e}")

    def detect_image(self, image):
        """
        Detect objects in an image using YOLOv5, drawing boxes for all detected classes.
        """
        result_image = image.copy()
        detections = []
        
        try:
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = self.model(image_rgb)
            df = results.pandas().xyxy[0]
            df = df[df['confidence'] > self.confidence_threshold]
            
            for index, row in df.iterrows():
                x1, y1, x2, y2 = int(row['xmin']), int(row['ymin']), int(row['xmax']), int(row['ymax'])
                confidence = float(row['confidence'])
                class_name = row['name']
                
                detection = {
                    'class': class_name,
                    'confidence': round(confidence, 3),
                    'bbox': [x1, y1, x2, y2]
                }
                detections.append(detection)
                
                # Vẽ bounding box cho TẤT CẢ các lớp được phát hiện
                color = self.colors.get(class_name, (255, 255, 255)) # Mặc định là màu trắng
                
                cv2.rectangle(result_image, (x1, y1), (x2, y2), color, 2)
                
                label = f"{class_name}: {confidence:.2f}"
                label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                
                cv2.rectangle(result_image, (x1, y1 - label_size[1] - 10), (x1 + label_size[0], y1), color, -1)
                cv2.putText(result_image, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2) # Chữ đen dễ đọc
                            
        except Exception as e:
            print(f"❌ Error during detection: {e}")
            return image.copy(), []
        
        return result_image, detections
    
    def set_confidence_threshold(self, threshold):
        if 0.0 <= threshold <= 1.0:
            self.confidence_threshold = threshold
            print(f"🎯 Updated confidence threshold to: {threshold}")
        else:
            print(f"❌ Invalid threshold value. Must be between 0.0 and 1.0")