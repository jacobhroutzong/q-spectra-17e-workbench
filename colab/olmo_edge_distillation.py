# ==============================================================================
# Q-SPECTRA // OLMo <-> Qwen 3.8 27B Teacher-Student Edge Distillation Script
# Loads `qspectra_17e_sft_corpus.jsonl` exported from Tab 06 (Quantum OSINT Hub)
# and distills reasoning traces into a compact 7B OLMo checkpoint for edge CEMA.
# ==============================================================================
# Dependencies:
#   pip install --no-deps "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
#   pip install --no-deps trl peft accelerate bitsandbytes datasets

import json
from pathlib import Path

import torch
from datasets import Dataset
from transformers import TrainingArguments
from trl import SFTTrainer
from unsloth import FastLanguageModel

CORPUS_PATH = Path("qspectra_17e_sft_corpus.jsonl")
STUDENT_MODEL_NAME = "allenai/OLMo-2-1124-7B-Instruct"
MAX_SEQ_LENGTH = 2048


def load_distillation_corpus(path: Path) -> list[dict]:
    if not path.exists():
        # Fallback seed if user runs script before exporting from Tab 06
        return [
            {
                "instruction": "Compute Autler-Townes splitting for 133Cs at n=68 under -5 dBm RF.",
                "output": (
                    "<think>\nScale dipole moment by n^2 * 1.14 * e * a0 and compute delta_f = (mu * E) / h.\n</think>\n"
                    "Autler-Townes splitting is 14.37 MHz; dielectric vapor cell remains immune to HPM burnout."
                ),
            }
        ]
    rows = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def format_olmo_prompt(row: dict) -> dict:
    return {
        "text": (
            "<|endoftext|><|user|>\n"
            f"{row['instruction']}\n"
            "<|assistant|>\n"
            f"{row['output']}<|endoftext|>"
        )
    }


def main() -> None:
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=STUDENT_MODEL_NAME,
        max_seq_length=MAX_SEQ_LENGTH,
        dtype=None,
        load_in_4bit=True,
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
    )

    samples = load_distillation_corpus(CORPUS_PATH)
    dataset = Dataset.from_list(samples).map(format_olmo_prompt)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LENGTH,
        args=TrainingArguments(
            per_device_train_batch_size=2,
            gradient_accumulation_steps=4,
            warmup_steps=5,
            max_steps=80,
            learning_rate=2e-4,
            fp16=not torch.cuda.is_bf16_supported(),
            bf16=torch.cuda.is_bf16_supported(),
            logging_steps=1,
            optim="adamw_8bit",
            output_dir="olmo_17e_edge_outputs",
        ),
    )

    trainer.train()
    model.save_pretrained_gguf("olmo-17e-edge", tokenizer, quantization_method="q4_k_m")
    print("Exported tactical edge student checkpoint: olmo-17e-edge.Q4_K_M.gguf")


if __name__ == "__main__":
    main()
