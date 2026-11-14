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
	npm test
	npm run build
	python -m unittest backend/test_main.py
	python -m py_compile backend/main.py backend/intel_harvester.py backend/sdr_processor.py colab/olmo_edge_distillation.py colab/colab_live_backend.py
