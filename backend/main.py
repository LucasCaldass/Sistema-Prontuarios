from fastapi import FastAPI, HTTPException, Form, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv
import jwt
import bcrypt
import os
from typing import List

# Carrega variáveis de ambiente
load_dotenv()

app = FastAPI()

# Configuração Supabase
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
supabase: Client = create_client(url, key)
security = HTTPBearer()


# --- Modelos Pydantic ---
class Paciente(BaseModel):
    nome: str
    cpf: str
    data_nascimento: str
    telefone: str


class Prontuario(BaseModel):
    id_paciente: str
    id_medico: str
    anamnese: str
    diagnostico: str
    observacoes: str


class Prescricao(BaseModel):
    id_prontuario: str
    medicamentos: List[str]


# --- Funções de Segurança ---
def create_access_token(data: dict):
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + timedelta(hours=8)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except:
        raise HTTPException(status_code=403, detail="Token inválido ou expirado")


def role_required(required_role: str):
    def role_checker(user=Depends(get_current_user)):
        if user["role"] != required_role:
            raise HTTPException(status_code=403, detail="Permissão negada")
        return user

    return role_checker


# --- Rotas ---

@app.post("/register")
def register_user(email: str = Form(...), senha: str = Form(...), role: str = Form(...)):
    existe = supabase.table("users").select("email").eq("email", email).execute()
    if existe.data:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado.")

    hashed_pw = bcrypt.hashpw(senha.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    data = {"email": email, "password_hash": hashed_pw, "role": role}
    supabase.table("users").insert(data).execute()
    return {"message": "Usuário criado com sucesso"}


@app.post("/login")
def login(email: str = Form(...), senha: str = Form(...)):
    res = supabase.table("users").select("*").eq("email", email).execute()
    user = res.data[0] if res.data else None
    if not user or not bcrypt.checkpw(senha.encode('utf-8'), user["password_hash"].encode('utf-8')):
        raise HTTPException(status_code=400, detail="Credenciais inválidas")

    token = create_access_token({"sub": email, "role": user["role"]})
    return {"access_token": token, "token_type": "bearer"}


@app.post("/pacientes")
def create_paciente(p: Paciente, user=Depends(get_current_user)):
    res = supabase.table("pacientes").insert(p.model_dump()).execute()
    return {"message": "Paciente cadastrado", "data": res.data}


@app.get("/pacientes")
def list_pacientes(user=Depends(get_current_user)):
    res = supabase.table("pacientes").select("*").execute()
    return res.data


@app.post("/prontuarios")
def create_prontuario(p: Prontuario, user=Depends(role_required("medico"))):
    data = p.model_dump()
    data["created_at"] = datetime.now().isoformat()
    res = supabase.table("medical_records").insert(data).execute()
    return res.data


@app.post("/prescricoes")
def create_prescricao(p: Prescricao, user=Depends(role_required("medico"))):
    data = p.model_dump()
    data["status"] = "Pendente"
    res = supabase.table("prescriptions").insert(data).execute()
    return res.data


@app.patch("/prescricoes/{id_prescricao}/dispensar")
def dispensar_medicamento(id_prescricao: str, user=Depends(role_required("farmaceutico"))):
    res = supabase.table("prescriptions").update({
        "status": "Entregue",
        "dispensed_at": datetime.now().isoformat()
    }).eq("id", id_prescricao).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Prescrição não encontrada")
    return {"message": "Dispensado com sucesso"}
