import os
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
import joblib
import numpy as np

from features import extract_feature_vector, FEATURE_COLUMNS

app = FastAPI(
    title="DeployShield ML Security Service",
    description="Runtime HTTP Request Classifier for Web Threat Detection",
    version="1.0.0"
)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "baseline.pkl")

# Global state for loaded model bundle
loaded_model_bundle = None

def load_model():
    global loaded_model_bundle
    if os.path.exists(MODEL_PATH):
        try:
            loaded_model_bundle = joblib.load(MODEL_PATH)
            print(f"[ML Service] Successfully loaded trained model from {MODEL_PATH}")
        except Exception as e:
            print(f"[ML Service Error] Failed loading model file: {e}")
            loaded_model_bundle = None
    else:
        print(f"[ML Service] No trained model file found at {MODEL_PATH}")
        loaded_model_bundle = None

@app.on_event("startup")
def startup_event():
    load_model()

class RequestPayload(BaseModel):
    method: str
    url: str
    headers: Optional[Dict[str, str]] = {}
    body: Optional[str] = ""

class ClassificationResponse(BaseModel):
    is_malicious: bool
    label: str  # "benign" or attack label e.g. "sqli", "xss", "cmd_injection"
    confidence: float
    model_version: str

@app.get("/health")
def health_check():
    # Reload model dynamically if file was added after startup
    if loaded_model_bundle is None and os.path.exists(MODEL_PATH):
        load_model()

    model_loaded = (loaded_model_bundle is not None)
    return {
        "service": "ml-service",
        "status": "ok",
        "model_loaded": model_loaded,
        "model_file": MODEL_PATH if model_loaded else None
    }

@app.post("/classify", response_model=ClassificationResponse)
def classify_request(payload: RequestPayload):
    global loaded_model_bundle

    # Check if model is loaded; try reloading if file exists now
    if loaded_model_bundle is None:
        if os.path.exists(MODEL_PATH):
            load_model()

    if loaded_model_bundle is None:
        raise HTTPException(
            status_code=status.HTTP_537_SERVICE_UNAVAILABLE if hasattr(status, 'HTTP_537_SERVICE_UNAVAILABLE') else 503,
            detail="Trained model not loaded. Please run 'python train.py' with a dataset in ml-service/data/ to generate models/baseline.pkl first."
        )

    clf = loaded_model_bundle['model']
    
    # 1. Extract feature vector
    feat_vector = extract_feature_vector(
        payload.method,
        payload.url,
        payload.headers,
        payload.body
    )

    # 2. Predict probability distribution across classes
    probs = clf.predict_proba([feat_vector])[0]
    classes = clf.classes_
    best_idx = int(np.argmax(probs))
    
    predicted_label = str(classes[best_idx]).lower()
    confidence = float(probs[best_idx])
    is_malicious = (predicted_label != "benign")

    return ClassificationResponse(
        is_malicious=is_malicious,
        label=predicted_label,
        confidence=round(confidence, 4),
        model_version="1.0.0-randomforest"
    )
