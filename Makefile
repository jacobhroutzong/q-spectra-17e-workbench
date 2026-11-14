.PHONY: install dev backend build check

install:
	npm install
	cd backend && pip install -r requirements.txt

dev:
	npm run dev

backend:
	cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload

build:
	npm run build

check:
	npm run build
	python -m py_compile backend/main.py backend/intel_harvester.py backend/sdr_processor.py colab/olmo_edge_distillation.py
