# ==============================================================================
# Q-SPECTRA // Unsloth QLoRA Fine-Tuning & Ollama + Colab MCP Server Script
# Target Model: Qwen 3.8 27B (4-bit QLoRA) -> GGUF Q4_K_M -> Ollama REST Bridge
# ==============================================================================
# Run in Google Colab Pro (A100 40GB or L4 24GB)

# 1. Install Unsloth, Ollama, and FastAPI Bridge dependencies
# !pip install --no-deps "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
# !pip install --no-deps trl peft accelerate bitsandbytes datasets fastapi uvicorn pyngrok
# !curl -fsSL https://ollama.com/install.sh | sh

import torch
from unsloth import FastLanguageModel
from datasets import Dataset
from trl import SFTTrainer
from transformers import TrainingArguments

max_seq_length = 2048
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Qwen3.8-27B-unsloth-bnb-4bit",
    max_seq_length=max_seq_length,
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

# Synthetic 17E Quantum CEMA Seed Dataset (Expandable via OLMo Distillation)
cema_samples = [
    {
        "instruction": "Calculate the Autler-Townes splitting frequency in MHz for an 85Rb Rydberg sensor at n=60 with dipole moment 3.1e-26 C*m under an incident E-field of 1.2 V/m.",
        "output": "<think>Using delta_f = (mu * E) / h. mu = 3.1e-26 C*m, E = 1.2 V/m, h = 6.626e-34 J*s. delta_f = (3.72e-26) / (6.626e-34) = 56.14 MHz.</think>The Autler-Townes splitting is 56.14 MHz, providing direct SI-traceable field strength readout without an antenna."
    },
    {
        "instruction": "How does Quantum Illumination radar defeat a Digital Radio Frequency Memory (DRFM) repeater jammer?",
        "output": "<think>Analyze SPDC entangled Signal-Idler pairs and the No-Cloning Theorem.</think>A DRFM jammer intercepts and retransmits coherent RF pulses, but cannot clone the entanglement between the Signal photon and the locally stored Idler photon. Joint Bell-state measurement at the receiver suppresses uncorrelated DRFM false targets by >20 dB."
    }
]

def format_cema(row):
    return {
        "text": f"<|im_start|>system\nYou are Q-SPECTRA, a 17E Quantum CEMA & EW specialist AI.<|im_end|>\n<|im_start|>user\n{row['instruction']}<|im_end|>\n<|im_start|>assistant\n{row['output']}<|im_end|>"
    }

dataset = Dataset.from_list(cema_samples).map(format_cema)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=max_seq_length,
    args=TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=5,
        max_steps=60,
        learning_rate=2e-4,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=1,
        optim="adamw_8bit",
        output_dir="outputs",
    ),
)

trainer.train()
model.save_pretrained_gguf("qwen_17e_cema_gguf", tokenizer, quantization_method="q4_k_m")
