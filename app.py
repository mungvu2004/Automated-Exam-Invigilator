# START OF FILE app.py

import os
import cv2
import numpy as np
import time
import json
import base64
import io
import logging
import tempfile
import shutil
import pandas as pd # Thêm import này
from flask import Flask, render_template, request, jsonify, Response, send_from_directory
from werkzeug.utils import secure_filename
from yolo_utils import YOLODetector

# CẢI TIẾN: Thiết lập logging chuyên nghiệp
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
app.static_folder = 'static'
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024
app.config['PROCESSED_FOLDER'] = 'processed'
# SỬA LỖI: Định nghĩa thư mục evidence ở cấp cao nhất
app.config['EVIDENCE_FOLDER'] = 'evidence'
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'avi', 'mov', 'mkv'}

# === SỬA LỖI THEO ĐÚNG TÊN LỚP CỦA MODEL ===
# Cập nhật để nhận dạng 'fraudulent' là lớp đáng ngờ.
SUSPICIOUS_CLASSES = {'fraudulent'}
# ============================================

# Các hằng số cho chức năng mới
MAX_SUSPICIOUS_FRAMES_TO_SAVE = 20
EVIDENCE_SIZE_LIMIT_MB = 100

os.makedirs(app.config['PROCESSED_FOLDER'], exist_ok=True)
os.makedirs(app.config['EVIDENCE_FOLDER'], exist_ok=True) # Đảm bảo thư mục evidence tồn tại
os.makedirs(app.static_folder, exist_ok=True)

detector = None

# >>> BỔ SUNG: Hàm dọn dẹp thư mục bằng chứng <<<
def cleanup_evidence_folder(folder_path, max_size_mb):
    try:
        max_size_bytes = max_size_mb * 1024 * 1024
        
        total_size = 0
        for dirpath, _, filenames in os.walk(folder_path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if not os.path.islink(fp):
                    total_size += os.path.getsize(fp)

        if total_size <= max_size_bytes:
            logging.info(f"Thư mục bằng chứng ({total_size / 1024**2:.2f}MB) chưa vượt ngưỡng {max_size_mb}MB. Không cần dọn dẹp.")
            return

        logging.warning(f"Thư mục bằng chứng ({total_size / 1024**2:.2f}MB) đã vượt ngưỡng {max_size_mb}MB. Bắt đầu dọn dẹp...")

        files = [os.path.join(folder_path, f) for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]
        files.sort(key=lambda x: os.path.getmtime(x))

        while total_size > max_size_bytes and files:
            file_to_delete = files.pop(0)
            try:
                file_size = os.path.getsize(file_to_delete)
                os.remove(file_to_delete)
                total_size -= file_size
                logging.info(f"Đã xóa file bằng chứng cũ: {os.path.basename(file_to_delete)}")
            except OSError as e:
                logging.error(f"Lỗi khi xóa file {file_to_delete}: {e}")
        
        logging.info("Hoàn tất dọn dẹp thư mục bằng chứng.")

    except Exception as e:
        logging.error(f"Lỗi không mong muốn trong quá trình dọn dẹp: {e}", exc_info=True)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def init_detector():
    global detector
    model_path = 'best_yolo5m.pt'
    if os.path.exists(model_path):
        try:
            detector = YOLODetector(model_path)
            logging.info("✅ YOLO model loaded successfully!")
            return True
        except Exception as e:
            logging.error(f"❌ Error loading YOLO model: {e}", exc_info=True)
            return False
    else:
        logging.warning(f"❌ Model file not found: {model_path}")
        return False

@app.route('/')
def index():
    model_loaded = detector is not None
    return render_template('index.html', model_loaded=model_loaded)

@app.route('/detect/image', methods=['POST'])
def detect_image():
    if detector is None:
        return jsonify({'error': 'Model chưa được tải.'}), 500
    if 'file' not in request.files:
        return jsonify({'error': 'Không có file được tải lên'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Không có file được chọn'}), 400
    if file and allowed_file(file.filename):
        try:
            image_bytes = file.read()
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if image is None: return jsonify({'error': 'Không thể đọc file ảnh'}), 400
            
            result_image, detections = detector.detect_image(image)
            _, buffer = cv2.imencode('.jpg', result_image)
            img_base64 = base64.b64encode(buffer).decode('utf-8')
            
            cheating_count = sum(1 for det in detections if det['class'].strip().lower() in SUSPICIOUS_CLASSES)
            
            return jsonify({
                'success': True,
                'image': img_base64,
                'detections': detections,
                'cheating_count': cheating_count,
                'message': 'Không phát hiện hành vi đáng ngờ.' if cheating_count == 0 else f'Phát hiện {cheating_count} hành vi đáng ngờ.'
            })
        except Exception as e:
            logging.error(f"Image processing error: {e}", exc_info=True)
            return jsonify({'error': f'Lỗi xử lý ảnh: {str(e)}'}), 500
    return jsonify({'error': 'Định dạng file không được hỗ trợ'}), 400

@app.route('/detect/video', methods=['POST'])
def detect_video():
    if detector is None: return jsonify({'error': 'Model chưa được tải.'}), 500
    if 'file' not in request.files: return jsonify({'error': 'Không có file được tải lên'}), 400
    file = request.files['file']
    if file.filename == '': return jsonify({'error': 'Không có file được chọn'}), 400

    if file and allowed_file(file.filename):
        temp_input_path = ''
        try:
            temp_input_file = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1])
            temp_input_path = temp_input_file.name
            shutil.copyfileobj(file.stream, temp_input_file)
            temp_input_file.close()

            def generate_frames(video_path):
                try:
                    cap = cv2.VideoCapture(video_path)
                    if not cap.isOpened():
                        logging.error(f"OpenCV failed to open video file: {video_path}")
                        raise IOError("Không thể mở video.")

                    fps = int(cap.get(cv2.CAP_PROP_FPS))
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

                    timestamp = str(int(time.time()))
                    output_filename = f"processed_{timestamp}.mp4"
                    output_filepath = os.path.join(app.config['PROCESSED_FOLDER'], output_filename)

                    fourcc = cv2.VideoWriter_fourcc(*'avc1')
                    out = cv2.VideoWriter(output_filepath, fourcc, fps, (width, height))

                    detection_summary = {}
                    suspicious_frames_evidence = []
                    frame_count = 0
                    
                    yield f"data: {json.dumps({'status': 'start', 'message': 'Bắt đầu xử lý...', 'total_frames': total_frames})}\n\n"

                    while cap.isOpened():
                        ret, frame = cap.read()
                        if not ret: break
                        
                        processed_frame, detections = detector.detect_image(frame)
                        out.write(processed_frame)
                        frame_count += 1
                        
                        is_suspicious_frame = any(det['class'] in SUSPICIOUS_CLASSES for det in detections)
                        for det in detections:
                            detection_summary[det['class']] = detection_summary.get(det['class'], 0) + 1
                            
                        if is_suspicious_frame and len(suspicious_frames_evidence) < MAX_SUSPICIOUS_FRAMES_TO_SAVE:
                            evidence_filename = f"evidence_{timestamp}_{frame_count}.jpg"
                            evidence_path = os.path.join(app.config['EVIDENCE_FOLDER'], evidence_filename)
                            cv2.imwrite(evidence_path, processed_frame)
                            suspicious_frames_evidence.append({
                                'frame_number': frame_count,
                                'filename': evidence_filename
                            })
                        
                        if frame_count % 10 == 0 or frame_count == total_frames:
                            progress = (frame_count / total_frames) * 100
                            yield f"data: {json.dumps({'status': 'progress', 'current_frame': frame_count, 'total_frames': total_frames, 'progress': round(progress, 2)})}\n\n"

                    cap.release()
                    out.release()
                    
                    suspicious_frames_count = len(suspicious_frames_evidence)
                    stats = {
                        'summary': detection_summary,
                        'suspicious_frames_count': suspicious_frames_count,
                        'suspicious_frames': suspicious_frames_evidence
                    }
                    yield f"data: {json.dumps({'status': 'done', 'filename': output_filename, 'message': 'Xử lý video thành công!', 'stats': stats})}\n\n"
                    
                    logging.info(f"Video processed successfully: {output_filename}")
                except Exception as e:
                    logging.error(f"Video processing stream error: {e}", exc_info=True)
                    yield f"data: {json.dumps({'status': 'error', 'error': f'Lỗi xử lý video: {str(e)}'})}\n\n"
                finally:
                    if os.path.exists(video_path):
                        os.remove(video_path)
                        logging.info(f"Cleaned up temporary file: {video_path}")
                    
                    cleanup_evidence_folder(app.config['EVIDENCE_FOLDER'], EVIDENCE_SIZE_LIMIT_MB)

            return Response(generate_frames(temp_input_path), mimetype='text/event-stream')
        except Exception as e:
            if temp_input_path and os.path.exists(temp_input_path):
                os.remove(temp_input_path)
            logging.error(f"Error setting up video processing: {e}", exc_info=True)
            return jsonify({'error': 'Lỗi server khi chuẩn bị xử lý video'}), 500
    return jsonify({'error': 'Định dạng file không được hỗ trợ'}), 400

@app.route('/processed/<filename>')
def serve_processed_video(filename):
    return send_from_directory(app.config['PROCESSED_FOLDER'], filename, as_attachment=False)

@app.route('/evidence/<filename>')
def serve_evidence_image(filename):
    return send_from_directory(app.config['EVIDENCE_FOLDER'], filename)

@app.route('/detect/webcam', methods=['POST'])
def detect_webcam():
    if detector is None: return jsonify({'error': 'Model chưa được tải'}), 500
    try:
        data = request.get_json()
        if not data or 'image' not in data: return jsonify({'error': 'Không có dữ liệu ảnh'}), 400
        image_data = data['image'].split(',')[1]
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None: return jsonify({'error': 'Không thể đọc frame'}), 400
        
        result_frame, detections = detector.detect_image(frame)
        _, buffer = cv2.imencode('.jpg', result_frame)
        result_base64 = base64.b64encode(buffer).decode('utf-8')
        
        cheating_count = sum(1 for det in detections if det['class'].strip().lower() in SUSPICIOUS_CLASSES)
        
        return jsonify({
            'success': True,
            'image': result_base64,
            'detections': detections,
            'cheating_count': cheating_count
        })
    except Exception as e:
        return jsonify({'error': f'Lỗi xử lý webcam: {str(e)}'}), 500

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File quá lớn. Kích thước tối đa là 500MB.'}), 413

@app.errorhandler(500)
def internal_error(e):
    logging.error(f"Internal Server Error: {e}", exc_info=True)
    return jsonify({'error': 'Lỗi server nội bộ. Vui lòng thử lại.'}), 500

# >>> BỔ SUNG: Routes cho trang kết quả huấn luyện <<<
TRAINING_RESULTS_DIR = 'fraud_yolov5m_run5'

@app.route('/results')
def show_results():
    results_path = os.path.join(os.getcwd(), TRAINING_RESULTS_DIR)
    
    if not os.path.isdir(results_path):
        return render_template('results.html', directory_exists=False, results_dir=TRAINING_RESULTS_DIR)

    assets = {
        'confusion_matrix': 'confusion_matrix.png',
        'results_png': 'results.png',
        'pr_curve': 'PR_curve.png',
        'labels_correlogram': 'labels_correlogram.jpg',
        'labels': 'labels.jpg',
        'best_map_score': 0,
        'chart_data': None
    }

    try:
        csv_path = os.path.join(results_path, 'results.csv')
        df = pd.read_csv(csv_path)
        
        df.columns = df.columns.str.strip()
        
        map_column = 'metrics/mAP_0.5'
        if map_column in df.columns:
            assets['best_map_score'] = df[map_column].max() * 100
        
        epochs = df['epoch'].tolist() if 'epoch' in df.columns else []
        precision = df['metrics/precision'].tolist() if 'metrics/precision' in df.columns else []
        recall = df['metrics/recall'].tolist() if 'metrics/recall' in df.columns else []
        map_05 = df[map_column].tolist() if map_column in df.columns else []
        
        assets['chart_data'] = {
            'epochs': epochs,
            'precision': precision,
            'recall': recall,
            'map_05': map_05
        }
    except (FileNotFoundError, pd.errors.EmptyDataError, KeyError) as e:
        logging.warning(f"Không thể xử lý results.csv: {e}")

    return render_template('results.html', directory_exists=True, assets=assets)

@app.route('/training_assets/<path:path>')
def serve_training_asset(path):
    return send_from_directory(TRAINING_RESULTS_DIR, path)


if __name__ == '__main__':
    logging.info("🚀 Khởi động Hệ thống Phát hiện Gian lận...")
    if init_detector():
        cleanup_evidence_folder(app.config['EVIDENCE_FOLDER'], EVIDENCE_SIZE_LIMIT_MB)
        logging.info("✅ Hệ thống sẵn sàng!")
    else:
        logging.warning("⚠️  Hệ thống khởi động nhưng chưa có model. Vui lòng đặt file best.pt vào thư mục gốc.")
    app.run(debug=True, host='0.0.0.0', port=5000)