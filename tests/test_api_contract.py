import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.core.config import get_settings
from backend.core.security import create_access_token
from backend.main import app
from backend.schemas.records import MedicalRecordCreate
from backend.schemas.auth import AuthenticatedUser
from backend.schemas.prescriptions import PrescriptionItemPayload
from backend.services import prescriptions as prescription_service
from backend.services.audit import write_audit_log
from backend.services.medical_records import create_medical_record
from backend.services.reports import indicators_report_to_csv


def create_test_token(role="medico"):
    return create_access_token(
        {
            "sub": f"{role}@example.com",
            "role": role,
            "user_id": f"00000000-0000-0000-0000-0000000000{len(role):02d}",
        }
    )


class FakeSupabaseResponse:
    def __init__(self, data):
        self.data = data


class FakeSupabaseQuery:
    def __init__(self, data):
        self.data = data

    def select(self, columns):
        return self

    def eq(self, column, value):
        return self

    def execute(self):
        return FakeSupabaseResponse(self.data)


class FakeSupabaseClient:
    def __init__(self, appointments):
        self.appointments = appointments

    def table(self, table_name):
        if table_name != "appointments":
            raise AssertionError(f"Tabela inesperada: {table_name}")
        return FakeSupabaseQuery(self.appointments)


class FakeMedicationQuery:
    def __init__(self, medications):
        self.medications = medications
        self.ids = None

    def select(self, columns):
        return self

    def in_(self, column, values):
        self.ids = set(values)
        return self

    def execute(self):
        data = self.medications
        if self.ids is not None:
            data = [item for item in self.medications if item["id"] in self.ids]
        return FakeSupabaseResponse(data)


class FakeMedicationClient:
    def __init__(self, medications):
        self.medications = medications

    def table(self, table_name):
        if table_name != "medications":
            raise AssertionError(f"Tabela inesperada: {table_name}")
        return FakeMedicationQuery(self.medications)


class ApiContractTests(unittest.TestCase):
    def setUp(self):
        get_settings.cache_clear()
        self.client = TestClient(app)

    def tearDown(self):
        get_settings.cache_clear()
        os.environ.pop("DATA_BACKEND", None)

    def test_health_reports_missing_configuration(self):
        os.environ["DATA_BACKEND"] = "supabase"
        os.environ["SUPABASE_URL"] = ""
        os.environ["SUPABASE_KEY"] = ""
        os.environ["SECRET_KEY"] = ""
        get_settings.cache_clear()

        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "ok",
                "supabase_configured": False,
                "secret_key_configured": False,
            },
        )

    def test_patients_requires_authentication(self):
        response = self.client.get("/pacientes")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"]["status_code"], 401)

    def test_cors_allows_frontend_origin(self):
        response = self.client.options(
            "/pacientes",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://127.0.0.1:5173",
        )

    def test_validation_errors_are_standardized(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token()

        response = self.client.post(
            "/prescricoes",
            headers={"Authorization": f"Bearer {token}"},
            json={"id_prontuario": "1", "medicamentos": ["   "]},
        )

        self.assertEqual(response.status_code, 422)
        body = response.json()
        self.assertEqual(body["error"]["message"], "Dados invalidos.")
        self.assertEqual(body["error"]["details"][0]["ctx"]["error"], "Informe pelo menos um medicamento.")

    def test_missing_supabase_configuration_returns_clear_error(self):
        os.environ["DATA_BACKEND"] = "supabase"
        os.environ["SUPABASE_URL"] = ""
        os.environ["SUPABASE_KEY"] = ""
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token()

        response = self.client.get(
            "/pacientes",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.json()["error"]["message"],
            "Configuracao ausente: SUPABASE_URL, SUPABASE_KEY.",
        )

    def test_me_returns_authenticated_user_from_token(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="recepcao")

        response = self.client.get(
            "/me",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "id": "00000000-0000-0000-0000-000000000008",
                "email": "recepcao@example.com",
                "role": "recepcao",
            },
        )

    def test_register_requires_authentication(self):
        response = self.client.post(
            "/register",
            data={
                "email": "novo@example.com",
                "senha": "Senha@123",
                "role": "recepcao",
            },
        )

        self.assertEqual(response.status_code, 401)

    def test_users_requires_admin_profile(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="medico")

        response = self.client.get(
            "/usuarios",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_reports_requires_admin_profile(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="medico")

        response = self.client.get(
            "/relatorios/indicadores",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_demo_reset_requires_admin_profile(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="medico")

        response = self.client.post(
            "/demo/reset",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_demo_reset_restores_local_json_data(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        os.environ["DATA_BACKEND"] = "json"
        get_settings.cache_clear()
        token = create_test_token(role="admin")

        response = self.client.post(
            "/demo/reset",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Base de demonstracao restaurada.")

    def test_reports_export_requires_admin_profile(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="medico")

        response = self.client.get(
            "/relatorios/indicadores/export.csv",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_audit_requires_admin_profile(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="recepcao")

        response = self.client.get(
            "/auditoria",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_audit_date_filter_validates_date_format(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="admin")

        response = self.client.get(
            "/auditoria?created_from=data-invalida",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 422)

    def test_appointments_requires_authentication(self):
        response = self.client.get("/consultas")

        self.assertEqual(response.status_code, 401)

    def test_attachments_requires_authentication(self):
        response = self.client.get("/anexos")

        self.assertEqual(response.status_code, 401)

    def test_farmaceutico_cannot_access_appointments(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="farmaceutico")

        response = self.client.get(
            "/consultas",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_farmaceutico_cannot_access_attachments(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="farmaceutico")

        response = self.client.get(
            "/anexos",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_farmaceutico_cannot_upload_attachments(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="farmaceutico")

        response = self.client.post(
            "/anexos/upload",
            headers={"Authorization": f"Bearer {token}"},
            data={
                "id_paciente": "10000000-0000-0000-0000-000000000001",
                "tipo": "Exame",
                "titulo": "Hemograma recente",
            },
            files={"file": ("hemograma.pdf", b"%PDF-1.4", "application/pdf")},
        )

        self.assertEqual(response.status_code, 403)

    def test_attachment_delete_requires_admin_profile(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="recepcao")

        response = self.client.delete(
            "/anexos/50000000-0000-0000-0000-000000000001",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_attachment_creation_validates_url(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="medico")

        response = self.client.post(
            "/anexos",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "id_paciente": "10000000-0000-0000-0000-000000000001",
                "tipo": "Exame",
                "titulo": "Hemograma recente",
                "arquivo_url": "arquivo-local.pdf",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_attachment_upload_validates_content_type(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="medico")

        response = self.client.post(
            "/anexos/upload",
            headers={"Authorization": f"Bearer {token}"},
            data={
                "id_paciente": "10000000-0000-0000-0000-000000000001",
                "tipo": "Exame",
                "titulo": "Arquivo de texto",
            },
            files={"file": ("nota.txt", b"texto simples", "text/plain")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Tipo de arquivo nao permitido", response.json()["error"]["message"])

    def test_appointment_creation_validates_datetime(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="recepcao")

        response = self.client.post(
            "/consultas",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "id_paciente": "10000000-0000-0000-0000-000000000001",
                "id_medico": "00000000-0000-0000-0000-000000000001",
                "scheduled_at": "data-invalida",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_medico_cannot_reschedule_appointment(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="medico")

        response = self.client.patch(
            "/consultas/40000000-0000-0000-0000-000000000001",
            headers={"Authorization": f"Bearer {token}"},
            json={"scheduled_at": "2026-06-20T12:00:00Z"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["error"]["message"],
            "Medico pode atualizar apenas status e observacoes da propria consulta.",
        )

    def test_admin_cannot_deactivate_own_user(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="admin")

        response = self.client.patch(
            "/usuarios/00000000-0000-0000-0000-000000000005",
            headers={"Authorization": f"Bearer {token}"},
            json={"ativo": False},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["error"]["message"],
            "Nao e possivel inativar o proprio usuario.",
        )

    def test_farmaceutico_cannot_access_patients(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="farmaceutico")

        response = self.client.get(
            "/pacientes",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_recepcao_cannot_access_prescriptions(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="recepcao")

        response = self.client.get(
            "/prescricoes",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_medications_requires_authentication(self):
        response = self.client.get("/medicamentos")

        self.assertEqual(response.status_code, 401)

    def test_stock_movements_requires_authentication(self):
        response = self.client.get("/medicamentos/movimentacoes")

        self.assertEqual(response.status_code, 401)

    def test_recepcao_cannot_access_medications(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="recepcao")

        response = self.client.get(
            "/medicamentos",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_recepcao_cannot_access_stock_movements(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="recepcao")

        response = self.client.get(
            "/medicamentos/movimentacoes",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_medico_cannot_create_medication(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="medico")

        response = self.client.post(
            "/medicamentos",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nome": "Dipirona",
                "apresentacao": "500mg",
                "quantidade": 10,
                "estoque_minimo": 2,
            },
        )

        self.assertEqual(response.status_code, 403)

    def test_stock_movement_validates_quantity(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="farmaceutico")

        response = self.client.post(
            "/medicamentos/60000000-0000-0000-0000-000000000001/movimentacoes",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "tipo": "Entrada",
                "quantidade": 0,
                "observacoes": "",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_stock_movement_filter_validates_type(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="farmaceutico")

        response = self.client.get(
            "/medicamentos/movimentacoes?tipo=Ajuste",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 422)

    def test_medical_record_creation_rejects_manual_doctor_id(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="medico")

        response = self.client.post(
            "/prontuarios",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "id_paciente": "10000000-0000-0000-0000-000000000001",
                "id_medico": "00000000-0000-0000-0000-000000000099",
                "anamnese": "Paciente relata dor persistente.",
                "diagnostico": "Observacao clinica",
                "observacoes": "",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_prescription_structured_item_validates_quantity(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="medico")

        response = self.client.post(
            "/prescricoes",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "id_prontuario": "20000000-0000-0000-0000-000000000001",
                "itens": [
                    {
                        "id_medicamento": "60000000-0000-0000-0000-000000000001",
                        "quantidade": 0,
                        "posologia": "Tomar a cada 8 horas.",
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_prescription_structured_item_rejects_unknown_medication(self):
        item = PrescriptionItemPayload(
            id_medicamento="60000000-0000-0000-0000-000000000404",
            quantidade=1,
            posologia="Tomar a cada 8 horas.",
        )

        with patch(
            "backend.services.prescriptions.get_supabase_client",
            return_value=FakeMedicationClient([]),
        ):
            with self.assertRaises(HTTPException) as context:
                prescription_service._validate_prescription_items([item])

        self.assertEqual(context.exception.status_code, 404)
        self.assertEqual(
            context.exception.detail,
            "Medicamento da prescricao nao encontrado.",
        )

    def test_prescription_structured_item_rejects_inactive_medication(self):
        item = PrescriptionItemPayload(
            id_medicamento="60000000-0000-0000-0000-000000000001",
            quantidade=1,
            posologia="Tomar a cada 8 horas.",
        )
        fake_client = FakeMedicationClient(
            [
                {
                    "id": item.id_medicamento,
                    "nome": "Dipirona",
                    "apresentacao": "500mg",
                    "ativo": False,
                }
            ]
        )

        with patch(
            "backend.services.prescriptions.get_supabase_client",
            return_value=fake_client,
        ):
            with self.assertRaises(HTTPException) as context:
                prescription_service._validate_prescription_items([item])

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(
            context.exception.detail,
            "Medicamento inativo nao pode ser prescrito.",
        )

    def test_medical_record_requires_completed_appointment_to_link(self):
        record = MedicalRecordCreate(
            id_paciente="10000000-0000-0000-0000-000000000001",
            id_consulta="40000000-0000-0000-0000-000000000001",
            anamnese="Paciente relata dor persistente.",
            diagnostico="Observacao clinica",
            observacoes="",
        )
        fake_client = FakeSupabaseClient(
            [
                {
                    "id": "40000000-0000-0000-0000-000000000001",
                    "id_paciente": "10000000-0000-0000-0000-000000000001",
                    "id_medico": "00000000-0000-0000-0000-000000000001",
                    "status": "Agendada",
                }
            ]
        )

        with patch("backend.services.medical_records.get_supabase_client", return_value=fake_client):
            with self.assertRaises(HTTPException) as context:
                create_medical_record(record, id_medico="00000000-0000-0000-0000-000000000001")

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(
            context.exception.detail,
            "Apenas consultas realizadas podem gerar prontuario.",
        )

    def test_audit_write_is_best_effort(self):
        user = AuthenticatedUser(
            id="00000000-0000-0000-0000-000000000010",
            email="admin@example.com",
            role="admin",
        )

        with patch("backend.services.audit.get_supabase_client", side_effect=RuntimeError("sem tabela")):
            write_audit_log(
                user,
                action="patient.create",
                resource_type="patient",
                resource_id="10000000-0000-0000-0000-000000000001",
            )

    def test_medical_record_date_filter_validates_date_format(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="admin")

        response = self.client.get(
            "/prontuarios?created_from=data-invalida",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 422)

    def test_reports_date_filter_validates_date_format(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="admin")

        response = self.client.get(
            "/relatorios/indicadores?created_to=data-invalida",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 422)

    def test_reports_export_date_filter_validates_date_format(self):
        os.environ["SECRET_KEY"] = "dev-secret-dev-secret-dev-secret-1234"
        get_settings.cache_clear()
        token = create_test_token(role="admin")

        response = self.client.get(
            "/relatorios/indicadores/export.csv?created_from=data-invalida",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 422)

    def test_reports_csv_includes_appointments_sections(self):
        report = {
            "period": {"created_from": None, "created_to": None},
            "totals": {
                "pacientes": 1,
                "prontuarios": 1,
                "prescricoes": 1,
                "prescricoes_pendentes": 1,
                "consultas": 2,
                "consultas_agendadas": 1,
                "consultas_realizadas": 1,
                "consultas_canceladas": 0,
                "medicamentos": 3,
                "medicamentos_baixo_estoque": 1,
                "movimentacoes_estoque": 2,
                "usuarios_ativos": 1,
                "usuarios_inativos": 0,
            },
            "prescriptions_by_status": [{"label": "Pendente", "value": 1}],
            "appointments_by_status": [{"label": "Agendada", "value": 1}],
            "stock_movements_by_type": [{"label": "Saida", "value": 2}],
            "patients_by_month": [],
            "records_by_day": [],
            "appointments_by_day": [{"label": "2026-06-17", "value": 2}],
            "stock_movements_by_day": [{"label": "2026-06-17", "value": 2}],
            "top_diagnoses": [],
        }

        content = indicators_report_to_csv(report)

        self.assertIn("Consultas;2", content)
        self.assertIn("Consultas por status", content)
        self.assertIn("Consultas por dia", content)
        self.assertIn("Movimentacoes de estoque;2", content)
        self.assertIn("Movimentacoes de estoque por tipo", content)


if __name__ == "__main__":
    unittest.main()
