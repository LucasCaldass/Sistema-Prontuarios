import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Eye,
  ExternalLink,
  LogOut,
  Paperclip,
  Pencil,
  Pill,
  RotateCcw,
  Search,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserPlus,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

import { ApiError, apiDownload, apiRequest, getApiUrl } from "./api";
import type {
  Appointment,
  AppointmentStatus,
  AttachmentType,
  AuditLog,
  ClinicalAttachment,
  CurrentUser,
  IndicatorsReport,
  MedicalRecord,
  Medication,
  PaginatedResponse,
  Patient,
  Prescription,
  PrescriptionItem,
  StockMovement,
  AppUser,
  UserRole,
} from "./types";

type View = "dashboard" | "patients" | "records" | "prescriptions" | "appointments" | "users" | "reports" | "audit";

type PatientForm = {
  nome: string;
  cpf: string;
  data_nascimento: string;
  telefone: string;
};

type RecordForm = {
  id_paciente: string;
  id_consulta: string;
  anamnese: string;
  diagnostico: string;
  observacoes: string;
};

type PrescriptionForm = {
  id_prontuario: string;
  medicamentos: string;
  item_medicamento_id: string;
  item_quantidade: string;
  item_posologia: string;
  itens: PrescriptionItem[];
};

type MedicationForm = {
  nome: string;
  apresentacao: string;
  quantidade: string;
  estoque_minimo: string;
};

type StockMovementForm = {
  id_medicamento: string;
  tipo: "Entrada" | "Saida";
  quantidade: string;
  observacoes: string;
};

type AppointmentForm = {
  id_paciente: string;
  id_medico: string;
  scheduled_at: string;
  status: AppointmentStatus;
  observacoes: string;
};

type AttachmentForm = {
  id_prontuario: string;
  tipo: AttachmentType;
  origem: "upload" | "url";
  titulo: string;
  arquivo_url: string;
  observacoes: string;
};

type UserForm = {
  nome: string;
  email: string;
  senha: string;
  role: UserRole;
  ativo: boolean;
};

type PrescriptionStatusFilter = "" | Prescription["status"];
type AppointmentStatusFilter = "" | AppointmentStatus;
type UserRoleFilter = "" | UserRole;
type ActiveFilter = "" | "true" | "false";
type AuditActionFilter = "" | AuditLog["action"];
type AuditResourceFilter = "" | AuditLog["resource_type"];

const emptyPatient: PatientForm = {
  nome: "",
  cpf: "",
  data_nascimento: "",
  telefone: "",
};

const emptyRecord: RecordForm = {
  id_paciente: "",
  id_consulta: "",
  anamnese: "",
  diagnostico: "",
  observacoes: "",
};

const emptyPrescription: PrescriptionForm = {
  id_prontuario: "",
  medicamentos: "",
  item_medicamento_id: "",
  item_quantidade: "1",
  item_posologia: "",
  itens: [],
};

const emptyMedication: MedicationForm = {
  nome: "",
  apresentacao: "",
  quantidade: "0",
  estoque_minimo: "0",
};

const emptyStockMovement: StockMovementForm = {
  id_medicamento: "",
  tipo: "Entrada",
  quantidade: "1",
  observacoes: "",
};

const emptyAppointment: AppointmentForm = {
  id_paciente: "",
  id_medico: "",
  scheduled_at: "",
  status: "Agendada",
  observacoes: "",
};

const attachmentTypes: AttachmentType[] = ["Exame", "Laudo", "Imagem", "Outro"];

const emptyAttachment: AttachmentForm = {
  id_prontuario: "",
  tipo: "Exame",
  origem: "upload",
  titulo: "",
  arquivo_url: "",
  observacoes: "",
};

const emptyUser: UserForm = {
  nome: "",
  email: "",
  senha: "",
  role: "recepcao",
  ativo: true,
};

const auditActions = [
  "patient.create",
  "patient.update",
  "patient.delete",
  "medical_record.create",
  "medical_record.update",
  "prescription.create",
  "prescription.update",
  "prescription.dispense",
  "medication.create",
  "medication.update",
  "medication.stock_movement",
  "appointment.create",
  "appointment.update",
  "attachment.create",
  "attachment.upload",
  "attachment.delete",
  "user.create",
  "user.update",
];

const auditResources = [
  "patient",
  "medical_record",
  "prescription",
  "medication",
  "appointment",
  "attachment",
  "user",
];

const demoProfiles = [
  {
    label: "Admin",
    description: "Usuarios, relatorios e auditoria",
    email: "admin@hospital.com",
    senha: "Admin@123",
  },
  {
    label: "Medico",
    description: "Prontuarios e prescricoes",
    email: "medico@hospital.com",
    senha: "Medico@123",
  },
  {
    label: "Recepcao",
    description: "Pacientes e agenda",
    email: "recepcao@hospital.com",
    senha: "Recepcao@123",
  },
  {
    label: "Farmacia",
    description: "Estoque e dispensacao",
    email: "farmacia@hospital.com",
    senha: "Farmacia@123",
  },
];

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("access_token") ?? "");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const selectedDemoProfile = demoProfiles.find((profile) => profile.email === email.trim().toLowerCase()) ?? null;
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [attachments, setAttachments] = useState<ClinicalAttachment[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [doctors, setDoctors] = useState<AppUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [report, setReport] = useState<IndicatorsReport | null>(null);
  const [patientForm, setPatientForm] = useState<PatientForm>(emptyPatient);
  const [recordForm, setRecordForm] = useState<RecordForm>(emptyRecord);
  const [prescriptionForm, setPrescriptionForm] = useState<PrescriptionForm>(emptyPrescription);
  const [medicationForm, setMedicationForm] = useState<MedicationForm>(emptyMedication);
  const [stockMovementForm, setStockMovementForm] = useState<StockMovementForm>(emptyStockMovement);
  const [appointmentForm, setAppointmentForm] = useState<AppointmentForm>(emptyAppointment);
  const [attachmentForm, setAttachmentForm] = useState<AttachmentForm>(emptyAttachment);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUser);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [editingPrescriptionId, setEditingPrescriptionId] = useState<string | null>(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientCpf, setPatientCpf] = useState("");
  const [recordPatientFilter, setRecordPatientFilter] = useState("");
  const [recordStartDate, setRecordStartDate] = useState("");
  const [recordEndDate, setRecordEndDate] = useState("");
  const [prescriptionStatusFilter, setPrescriptionStatusFilter] = useState<PrescriptionStatusFilter>("");
  const [appointmentPatientFilter, setAppointmentPatientFilter] = useState("");
  const [appointmentDoctorFilter, setAppointmentDoctorFilter] = useState("");
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<AppointmentStatusFilter>("");
  const [appointmentStartDate, setAppointmentStartDate] = useState("");
  const [appointmentEndDate, setAppointmentEndDate] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<UserRoleFilter>("");
  const [userActiveFilter, setUserActiveFilter] = useState<ActiveFilter>("");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState<AuditActionFilter>("");
  const [auditResourceFilter, setAuditResourceFilter] = useState<AuditResourceFilter>("");
  const [auditActorFilter, setAuditActorFilter] = useState("");
  const [auditStartDate, setAuditStartDate] = useState("");
  const [auditEndDate, setAuditEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pendingPrescriptions = useMemo(
    () => prescriptions.filter((item) => item.status === "Pendente").length,
    [prescriptions],
  );
  const scheduledAppointments = useMemo(
    () => appointments.filter((item) => item.status === "Agendada").length,
    [appointments],
  );

  async function loadData(currentToken = token) {
    if (!currentToken) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const userData = await apiRequest<CurrentUser>("/me", { token: currentToken });
      setCurrentUser(userData);
      if (!isViewAllowed(view, userData.role)) {
        setView("dashboard");
      }
      const cpfDigits = patientCpf.replace(/\D/g, "");
      const patientQuery = buildQuery({
        search: patientSearch.trim().length >= 2 ? patientSearch.trim() : "",
        cpf: cpfDigits.length === 11 ? cpfDigits : "",
      });
      const recordQuery = buildQuery({
        id_paciente: recordPatientFilter,
        created_from: recordStartDate,
        created_to: recordEndDate,
      });
      const prescriptionQuery = buildQuery({
        status: prescriptionStatusFilter,
      });
      const appointmentQuery = buildQuery({
        id_paciente: appointmentPatientFilter,
        id_medico: appointmentDoctorFilter,
        status: appointmentStatusFilter,
        scheduled_from: appointmentStartDate,
        scheduled_to: appointmentEndDate,
      });
      const userQuery = buildQuery({
        search: userSearch.trim().length >= 2 ? userSearch.trim() : "",
        role: userRoleFilter,
        ativo: userActiveFilter,
      });
      const reportQuery = buildQuery({
        created_from: reportStartDate,
        created_to: reportEndDate,
      });
      const auditQuery = buildQuery({
        action: auditActionFilter,
        resource_type: auditResourceFilter,
        actor_email: auditActorFilter.trim().length >= 2 ? auditActorFilter.trim() : "",
        created_from: auditStartDate,
        created_to: auditEndDate,
      });
      const patientRequest = canAccessPatients(userData.role)
        ? apiRequest<PaginatedResponse<Patient>>(`/pacientes${patientQuery}`, { token: currentToken })
        : Promise.resolve(emptyPage<Patient>());
      const recordRequest = canAccessRecords(userData.role)
        ? apiRequest<PaginatedResponse<MedicalRecord>>(`/prontuarios${recordQuery}`, { token: currentToken })
        : Promise.resolve(emptyPage<MedicalRecord>());
      const prescriptionRequest = canAccessPrescriptions(userData.role)
        ? apiRequest<PaginatedResponse<Prescription>>(`/prescricoes${prescriptionQuery}`, { token: currentToken })
        : Promise.resolve(emptyPage<Prescription>());
      const medicationRequest = canAccessMedications(userData.role)
        ? apiRequest<PaginatedResponse<Medication>>("/medicamentos?limit=100", { token: currentToken })
        : Promise.resolve(emptyPage<Medication>());
      const stockMovementRequest = canAccessMedications(userData.role)
        ? apiRequest<PaginatedResponse<StockMovement>>("/medicamentos/movimentacoes?limit=50", { token: currentToken })
        : Promise.resolve(emptyPage<StockMovement>());
      const appointmentRequest = canAccessAppointments(userData.role)
        ? apiRequest<PaginatedResponse<Appointment>>(`/consultas${appointmentQuery}`, { token: currentToken })
        : Promise.resolve(emptyPage<Appointment>());
      const attachmentRequest = canAccessAttachments(userData.role)
        ? apiRequest<PaginatedResponse<ClinicalAttachment>>("/anexos?limit=100", { token: currentToken })
        : Promise.resolve(emptyPage<ClinicalAttachment>());
      const doctorRequest = canAccessAppointments(userData.role)
        ? apiRequest<AppUser[]>("/usuarios/medicos", { token: currentToken })
        : Promise.resolve([]);
      const userRequest = canAccessUsers(userData.role)
        ? apiRequest<PaginatedResponse<AppUser>>(`/usuarios${userQuery}`, { token: currentToken })
        : Promise.resolve(emptyPage<AppUser>());
      const reportRequest = canAccessReports(userData.role)
        ? apiRequest<IndicatorsReport>(`/relatorios/indicadores${reportQuery}`, { token: currentToken })
        : Promise.resolve(null);
      const auditRequest = canAccessAudit(userData.role)
        ? apiRequest<PaginatedResponse<AuditLog>>(`/auditoria${auditQuery}`, { token: currentToken })
        : Promise.resolve(emptyPage<AuditLog>());
      const [patientData, recordData, prescriptionData, medicationData, stockMovementData, appointmentData, attachmentData, doctorData, userDataPage, reportData, auditData] = await Promise.all([
        patientRequest,
        recordRequest,
        prescriptionRequest,
        medicationRequest,
        stockMovementRequest,
        appointmentRequest,
        attachmentRequest,
        doctorRequest,
        userRequest,
        reportRequest,
        auditRequest,
      ]);
      setPatients(patientData.items);
      setRecords(recordData.items);
      setPrescriptions(prescriptionData.items);
      setMedications(medicationData.items);
      setStockMovements(stockMovementData.items);
      setAppointments(appointmentData.items);
      setAttachments(attachmentData.items);
      setDoctors(doctorData);
      setUsers(userDataPage.items);
      setReport(reportData);
      setAuditLogs(auditData.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        setError("Sessao expirada. Faca login novamente.");
        return;
      }
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar os dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      void loadData(token);
    }
  }, [token]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loginWith(email, senha);
  }

  async function loginWith(loginEmail: string, loginSenha: string) {
    setLoading(true);
    setError("");
    const form = new FormData();
    form.set("email", loginEmail);
    form.set("senha", loginSenha);
    try {
      const data = await apiRequest<{ access_token: string }>("/login", {
        method: "POST",
        form,
      });
      localStorage.setItem("access_token", data.access_token);
      setToken(data.access_token);
      setEmail(loginEmail);
      setSenha(loginSenha);
      setMessage("Login realizado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel entrar.");
    } finally {
      setLoading(false);
    }
  }

  async function createPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiRequest(editingPatientId ? `/pacientes/${editingPatientId}` : "/pacientes", {
        method: editingPatientId ? "PATCH" : "POST",
        token,
        body: patientForm,
      });
      setPatientForm(emptyPatient);
      setEditingPatientId(null);
      setMessage(editingPatientId ? "Paciente atualizado." : "Paciente cadastrado.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar paciente.");
    } finally {
      setLoading(false);
    }
  }

  function startEditingPatient(patient: Patient) {
    setEditingPatientId(patient.id);
    setPatientForm({
      nome: patient.nome,
      cpf: patient.cpf,
      data_nascimento: patient.data_nascimento,
      telefone: patient.telefone,
    });
  }

  function cancelPatientEditing() {
    setEditingPatientId(null);
    setPatientForm(emptyPatient);
  }

  async function removePatient(id: string) {
    if (!window.confirm("Remover este paciente? Essa acao nao pode ser desfeita.")) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiRequest(`/pacientes/${id}`, {
        method: "DELETE",
        token,
      });
      if (selectedPatientId === id) {
        setSelectedPatientId(null);
      }
      setMessage("Paciente removido.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel remover paciente.");
    } finally {
      setLoading(false);
    }
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body = {
        ...recordForm,
        id_consulta: recordForm.id_consulta || undefined,
      };
      await apiRequest("/prontuarios", {
        method: "POST",
        token,
        body,
      });
      setRecordForm(emptyRecord);
      setMessage("Prontuario registrado.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel registrar prontuario.");
    } finally {
      setLoading(false);
    }
  }

  async function createPrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const medicamentos = prescriptionForm.medicamentos
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const itens = prescriptionForm.itens.map((item) => ({
      id_medicamento: item.id_medicamento,
      quantidade: item.quantidade,
      posologia: item.posologia,
    }));

    setLoading(true);
    setError("");
    try {
      const body = editingPrescriptionId
        ? {
            medicamentos: medicamentos.length ? medicamentos : undefined,
            itens: itens.length ? itens : undefined,
          }
        : {
            id_prontuario: prescriptionForm.id_prontuario,
            medicamentos: medicamentos.length ? medicamentos : undefined,
            itens: itens.length ? itens : undefined,
          };
      await apiRequest(editingPrescriptionId ? `/prescricoes/${editingPrescriptionId}` : "/prescricoes", {
        method: editingPrescriptionId ? "PATCH" : "POST",
        token,
        body,
      });
      setPrescriptionForm(emptyPrescription);
      setEditingPrescriptionId(null);
      setMessage(editingPrescriptionId ? "Prescricao atualizada." : "Prescricao criada.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar prescricao.");
    } finally {
      setLoading(false);
    }
  }

  function startEditingPrescription(prescription: Prescription) {
    setEditingPrescriptionId(prescription.id);
    setPrescriptionForm({
      id_prontuario: prescription.id_prontuario,
      medicamentos: prescription.medicamentos.join("\n"),
      item_medicamento_id: "",
      item_quantidade: "1",
      item_posologia: "",
      itens: prescription.itens ?? [],
    });
  }

  function selectDemoProfile(profile: (typeof demoProfiles)[number]) {
    setEmail(profile.email);
    setSenha("");
    setError("");
  }

  function cancelPrescriptionEditing() {
    setEditingPrescriptionId(null);
    setPrescriptionForm(emptyPrescription);
  }

  async function cancelPrescription(id: string) {
    if (!window.confirm("Cancelar esta prescricao?")) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiRequest(`/prescricoes/${id}`, {
        method: "PATCH",
        token,
        body: { status: "Cancelada" },
      });
      setMessage("Prescricao cancelada.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel cancelar prescricao.");
    } finally {
      setLoading(false);
    }
  }

  async function dispensePrescription(id: string) {
    setLoading(true);
    setError("");
    try {
      await apiRequest(`/prescricoes/${id}/dispensar`, {
        method: "PATCH",
        token,
      });
      setMessage("Medicamento dispensado.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel dispensar.");
    } finally {
      setLoading(false);
    }
  }

  async function resetDemoData() {
    if (!window.confirm("Restaurar a base de demonstracao? Os cadastros feitos nos testes serao apagados.")) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiRequest("/demo/reset", {
        method: "POST",
        token,
      });
      setMessage("Base de demonstracao restaurada.");
      setView("dashboard");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel resetar a demonstracao.");
    } finally {
      setLoading(false);
    }
  }

  async function createMedication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiRequest("/medicamentos", {
        method: "POST",
        token,
        body: {
          nome: medicationForm.nome,
          apresentacao: medicationForm.apresentacao,
          quantidade: Number(medicationForm.quantidade),
          estoque_minimo: Number(medicationForm.estoque_minimo),
          ativo: true,
        },
      });
      setMedicationForm(emptyMedication);
      setMessage("Medicamento cadastrado no estoque.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel cadastrar medicamento.");
    } finally {
      setLoading(false);
    }
  }

  async function createStockMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiRequest(`/medicamentos/${stockMovementForm.id_medicamento}/movimentacoes`, {
        method: "POST",
        token,
        body: {
          tipo: stockMovementForm.tipo,
          quantidade: Number(stockMovementForm.quantidade),
          observacoes: stockMovementForm.observacoes,
        },
      });
      setStockMovementForm(emptyStockMovement);
      setMessage("Estoque atualizado.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel atualizar estoque.");
    } finally {
      setLoading(false);
    }
  }

  async function saveAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const body = editingAppointmentId
      ? {
          id_paciente: appointmentForm.id_paciente,
          id_medico: appointmentForm.id_medico,
          scheduled_at: toApiDateTime(appointmentForm.scheduled_at),
          status: appointmentForm.status,
          observacoes: appointmentForm.observacoes,
        }
      : {
          id_paciente: appointmentForm.id_paciente,
          id_medico: appointmentForm.id_medico,
          scheduled_at: toApiDateTime(appointmentForm.scheduled_at),
          observacoes: appointmentForm.observacoes,
        };

    try {
      await apiRequest(editingAppointmentId ? `/consultas/${editingAppointmentId}` : "/consultas", {
        method: editingAppointmentId ? "PATCH" : "POST",
        token,
        body,
      });
      setAppointmentForm(emptyAppointment);
      setEditingAppointmentId(null);
      setMessage(editingAppointmentId ? "Consulta atualizada." : "Consulta agendada.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar consulta.");
    } finally {
      setLoading(false);
    }
  }

  function startEditingAppointment(appointment: Appointment) {
    setEditingAppointmentId(appointment.id);
    setAppointmentForm({
      id_paciente: appointment.id_paciente,
      id_medico: appointment.id_medico,
      scheduled_at: toDateTimeLocal(appointment.scheduled_at),
      status: appointment.status,
      observacoes: appointment.observacoes ?? "",
    });
  }

  function cancelAppointmentEditing() {
    setEditingAppointmentId(null);
    setAppointmentForm(emptyAppointment);
  }

  function startRecordFromAppointment(appointment: Appointment) {
    setRecordForm({
      id_paciente: appointment.id_paciente,
      id_consulta: appointment.id,
      anamnese: "",
      diagnostico: "",
      observacoes: appointment.observacoes
        ? `Consulta em ${formatDateTime(appointment.scheduled_at)}. ${appointment.observacoes}`
        : `Consulta em ${formatDateTime(appointment.scheduled_at)}.`,
    });
    setRecordPatientFilter(appointment.id_paciente);
    setView("records");
    setMessage("Prontuario preparado com paciente e consulta vinculados.");
  }

  async function updateAppointmentStatus(id: string, statusValue: AppointmentStatus) {
    if (statusValue === "Cancelada" && !window.confirm("Cancelar esta consulta?")) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiRequest(`/consultas/${id}`, {
        method: "PATCH",
        token,
        body: { status: statusValue },
      });
      setMessage(statusValue === "Realizada" ? "Consulta marcada como realizada." : "Consulta cancelada.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel atualizar consulta.");
    } finally {
      setLoading(false);
    }
  }

  async function createAttachment(patientId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setLoading(true);
    setError("");
    try {
      if (attachmentForm.origem === "upload") {
        if (!attachmentFile) {
          setError("Selecione um arquivo para enviar.");
          return;
        }
        const form = new FormData();
        form.set("id_paciente", patientId);
        form.set("tipo", attachmentForm.tipo);
        form.set("titulo", attachmentForm.titulo);
        form.set("observacoes", attachmentForm.observacoes);
        if (attachmentForm.id_prontuario) {
          form.set("id_prontuario", attachmentForm.id_prontuario);
        }
        form.set("file", attachmentFile);
        await apiRequest("/anexos/upload", {
          method: "POST",
          token,
          form,
        });
      } else {
        await apiRequest("/anexos", {
          method: "POST",
          token,
          body: {
            id_paciente: patientId,
            id_prontuario: attachmentForm.id_prontuario || undefined,
            tipo: attachmentForm.tipo,
            titulo: attachmentForm.titulo,
            arquivo_url: attachmentForm.arquivo_url,
            observacoes: attachmentForm.observacoes,
          },
        });
      }
      setAttachmentForm(emptyAttachment);
      setAttachmentFile(null);
      formElement.reset();
      setMessage("Anexo registrado.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel registrar o anexo.");
    } finally {
      setLoading(false);
    }
  }

  async function removeAttachment(id: string) {
    if (!window.confirm("Remover este anexo clinico?")) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiRequest(`/anexos/${id}`, {
        method: "DELETE",
        token,
      });
      setMessage("Anexo removido.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel remover o anexo.");
    } finally {
      setLoading(false);
    }
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const body: Partial<UserForm> = {
      nome: userForm.nome || undefined,
      email: userForm.email,
      role: userForm.role,
      ativo: userForm.ativo,
    };
    if (userForm.senha) {
      body.senha = userForm.senha;
    }

    try {
      await apiRequest(editingUserId ? `/usuarios/${editingUserId}` : "/usuarios", {
        method: editingUserId ? "PATCH" : "POST",
        token,
        body,
      });
      setUserForm(emptyUser);
      setEditingUserId(null);
      setMessage(editingUserId ? "Usuario atualizado." : "Usuario criado.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar usuario.");
    } finally {
      setLoading(false);
    }
  }

  async function exportReportCsv() {
    setLoading(true);
    setError("");
    try {
      const reportQuery = buildQuery({
        created_from: reportStartDate,
        created_to: reportEndDate,
      });
      const blob = await apiDownload(`/relatorios/indicadores/export.csv${reportQuery}`, { token });
      downloadBlob(blob, "relatorio-indicadores.csv");
      setMessage("Relatorio CSV gerado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel exportar o relatorio.");
    } finally {
      setLoading(false);
    }
  }

  function printPatientRecord() {
    printCurrentView("patient");
  }

  function printReport() {
    printCurrentView("report");
  }

  function startEditingUser(user: AppUser) {
    setEditingUserId(user.id);
    setUserForm({
      nome: user.nome ?? "",
      email: user.email,
      senha: "",
      role: user.role,
      ativo: user.ativo,
    });
  }

  function cancelUserEditing() {
    setEditingUserId(null);
    setUserForm(emptyUser);
  }

  function logout() {
    localStorage.removeItem("access_token");
    setToken("");
    setEmail("");
    setSenha("");
    setCurrentUser(null);
    setPatients([]);
    setRecords([]);
    setPrescriptions([]);
    setMedications([]);
    setStockMovements([]);
    setAppointments([]);
    setAttachments([]);
    setUsers([]);
    setDoctors([]);
    setAuditLogs([]);
    setReport(null);
    setSelectedPatientId(null);
  }

  if (!token) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <div className="auth-brand">
            <ShieldCheck size={36} />
            <div>
              <span>Prontuarios</span>
              <strong>Gestao Clinica</strong>
            </div>
          </div>
          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="medico@hospital.com"
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="Sua senha"
                required
              />
            </label>
            {selectedDemoProfile && (
              <p className="demo-credential-hint">
                Perfil selecionado: <strong>{selectedDemoProfile.label}</strong>. Digite a senha de teste{" "}
                <strong>{selectedDemoProfile.senha}</strong> e clique em Entrar.
              </p>
            )}
            {error && <div className="alert error">{error}</div>}
            <button disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
          </form>
          <div className="demo-login">
            <span className="helper-text">Perfis de demonstracao</span>
            <div className="demo-login-grid">
              {demoProfiles.map((profile) => (
                <button
                  key={profile.email}
                  type="button"
                  className="demo-login-button"
                  onClick={() => selectDemoProfile(profile)}
                  disabled={loading}
                >
                  <strong>{profile.label}</strong>
                  <small>{profile.description}</small>
                </button>
              ))}
            </div>
          </div>
          <p className="api-note">API: {getApiUrl()}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Stethoscope size={28} />
          <div>
            <span>Sistema</span>
            <strong>Prontuarios</strong>
          </div>
        </div>
        <nav>
          <NavButton icon={<Activity size={18} />} label="Painel" active={view === "dashboard"} onClick={() => setView("dashboard")} />
          {currentUser && canAccessPatients(currentUser.role) && (
            <NavButton icon={<Users size={18} />} label="Pacientes" active={view === "patients"} onClick={() => setView("patients")} />
          )}
          {currentUser && canAccessRecords(currentUser.role) && (
            <NavButton icon={<ClipboardList size={18} />} label="Prontuarios" active={view === "records"} onClick={() => setView("records")} />
          )}
          {currentUser && canAccessPrescriptions(currentUser.role) && (
            <NavButton icon={<Pill size={18} />} label="Farmacia" active={view === "prescriptions"} onClick={() => setView("prescriptions")} />
          )}
          {currentUser && canAccessAppointments(currentUser.role) && (
            <NavButton icon={<CalendarDays size={18} />} label="Agenda" active={view === "appointments"} onClick={() => setView("appointments")} />
          )}
          {currentUser && canAccessUsers(currentUser.role) && (
            <NavButton icon={<UserCog size={18} />} label="Usuarios" active={view === "users"} onClick={() => setView("users")} />
          )}
          {currentUser && canAccessReports(currentUser.role) && (
            <NavButton icon={<BarChart3 size={18} />} label="Relatorios" active={view === "reports"} onClick={() => setView("reports")} />
          )}
          {currentUser && canAccessAudit(currentUser.role) && (
            <NavButton icon={<ShieldCheck size={18} />} label="Auditoria" active={view === "audit"} onClick={() => setView("audit")} />
          )}
        </nav>
        <button className="ghost-button" onClick={logout}>
          <LogOut size={18} />
          Sair
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Ambiente operacional</span>
            <h1>{titleFor(view)}</h1>
            {currentUser && (
              <p className="user-line">
                {roleLabel(currentUser.role)} - {currentUser.email}
              </p>
            )}
          </div>
          <button className="secondary-button" onClick={() => loadData()} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </header>

        {(message || error) && (
          <div className={`alert ${error ? "error" : "success"}`}>
            {error || message}
            <button onClick={() => { setError(""); setMessage(""); }}>Fechar</button>
          </div>
        )}

        {view === "dashboard" && (
          <Dashboard
            patients={patients.length}
            records={records.length}
            prescriptions={prescriptions.length}
            pendingPrescriptions={pendingPrescriptions}
            scheduledAppointments={scheduledAppointments}
            users={users.length}
            canResetDemo={currentUser?.role === "admin"}
            onResetDemo={resetDemoData}
            loading={loading}
          />
        )}

        {view === "patients" && (
          <PatientsView
            form={patientForm}
            setForm={setPatientForm}
            patients={patients}
            records={records}
            prescriptions={prescriptions}
            attachments={attachments}
            attachmentForm={attachmentForm}
            attachmentFile={attachmentFile}
            setAttachmentForm={setAttachmentForm}
            setAttachmentFile={setAttachmentFile}
            canManage={currentUser ? canManagePatients(currentUser.role) : false}
            canDelete={currentUser?.role === "admin"}
            canViewPrescriptions={currentUser ? canAccessPrescriptions(currentUser.role) : false}
            canManageAttachments={currentUser ? canManageAttachments(currentUser.role) : false}
            canDeleteAttachments={currentUser ? canDeleteAttachments(currentUser.role) : false}
            editingPatientId={editingPatientId}
            selectedPatientId={selectedPatientId}
            search={patientSearch}
            cpfFilter={patientCpf}
            setSearch={setPatientSearch}
            setCpfFilter={setPatientCpf}
            onSearch={() => loadData()}
            onSubmit={createPatient}
            onEdit={startEditingPatient}
            onDelete={removePatient}
            onCancelEdit={cancelPatientEditing}
            onSelectPatient={setSelectedPatientId}
            onPrintPatient={printPatientRecord}
            onCreateAttachment={createAttachment}
            onDeleteAttachment={removeAttachment}
          />
        )}

        {view === "records" && (
          <RecordsView
            form={recordForm}
            setForm={setRecordForm}
            patients={patients}
            records={records}
            linkedAppointment={appointments.find((appointment) => appointment.id === recordForm.id_consulta) ?? null}
            canCreate={currentUser?.role === "medico"}
            patientFilter={recordPatientFilter}
            startDate={recordStartDate}
            endDate={recordEndDate}
            setPatientFilter={setRecordPatientFilter}
            setStartDate={setRecordStartDate}
            setEndDate={setRecordEndDate}
            onFilter={() => loadData()}
            onSubmit={createRecord}
          />
        )}

        {view === "prescriptions" && (
          <PrescriptionsView
            form={prescriptionForm}
            setForm={setPrescriptionForm}
            medicationForm={medicationForm}
            setMedicationForm={setMedicationForm}
            stockMovementForm={stockMovementForm}
            setStockMovementForm={setStockMovementForm}
            patients={patients}
            records={records}
            prescriptions={prescriptions}
            medications={medications}
            stockMovements={stockMovements}
            canCreate={currentUser?.role === "medico"}
            canDispense={currentUser?.role === "farmaceutico"}
            canManageStock={currentUser ? canManageMedications(currentUser.role) : false}
            editingPrescriptionId={editingPrescriptionId}
            statusFilter={prescriptionStatusFilter}
            setStatusFilter={setPrescriptionStatusFilter}
            onFilter={() => loadData()}
            onSubmit={createPrescription}
            onDispense={dispensePrescription}
            onCreateMedication={createMedication}
            onCreateStockMovement={createStockMovement}
            onEdit={startEditingPrescription}
            onCancelPrescription={cancelPrescription}
            onCancelEdit={cancelPrescriptionEditing}
          />
        )}

        {view === "appointments" && (
          <AppointmentsView
            form={appointmentForm}
            setForm={setAppointmentForm}
            appointments={appointments}
            patients={patients}
            doctors={doctors}
            records={records}
            canManage={currentUser ? canManageAppointments(currentUser.role) : false}
            canEdit={currentUser ? canManageAppointments(currentUser.role) : false}
            canCreateRecord={currentUser?.role === "medico"}
            canUpdateStatus={currentUser ? canAccessAppointments(currentUser.role) : false}
            editingAppointmentId={editingAppointmentId}
            patientFilter={appointmentPatientFilter}
            doctorFilter={appointmentDoctorFilter}
            statusFilter={appointmentStatusFilter}
            startDate={appointmentStartDate}
            endDate={appointmentEndDate}
            setPatientFilter={setAppointmentPatientFilter}
            setDoctorFilter={setAppointmentDoctorFilter}
            setStatusFilter={setAppointmentStatusFilter}
            setStartDate={setAppointmentStartDate}
            setEndDate={setAppointmentEndDate}
            onFilter={() => loadData()}
            onSubmit={saveAppointment}
            onEdit={startEditingAppointment}
            onCancelEdit={cancelAppointmentEditing}
            onCreateRecord={startRecordFromAppointment}
            onStatusChange={updateAppointmentStatus}
          />
        )}

        {view === "users" && (
          <UsersView
            form={userForm}
            setForm={setUserForm}
            users={users}
            currentUserId={currentUser?.id ?? ""}
            editingUserId={editingUserId}
            search={userSearch}
            roleFilter={userRoleFilter}
            activeFilter={userActiveFilter}
            setSearch={setUserSearch}
            setRoleFilter={setUserRoleFilter}
            setActiveFilter={setUserActiveFilter}
            onFilter={() => loadData()}
            onSubmit={saveUser}
            onEdit={startEditingUser}
            onCancelEdit={cancelUserEditing}
          />
        )}

        {view === "reports" && (
          <ReportsView
            report={report}
            startDate={reportStartDate}
            endDate={reportEndDate}
            setStartDate={setReportStartDate}
            setEndDate={setReportEndDate}
            onFilter={() => loadData()}
            onExport={exportReportCsv}
            onPrint={printReport}
          />
        )}

        {view === "audit" && (
          <AuditView
            logs={auditLogs}
            actionFilter={auditActionFilter}
            resourceFilter={auditResourceFilter}
            actorFilter={auditActorFilter}
            startDate={auditStartDate}
            endDate={auditEndDate}
            setActionFilter={setAuditActionFilter}
            setResourceFilter={setAuditResourceFilter}
            setActorFilter={setAuditActorFilter}
            setStartDate={setAuditStartDate}
            setEndDate={setAuditEndDate}
            onFilter={() => loadData()}
          />
        )}
      </section>
    </main>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function Dashboard({
  patients,
  records,
  prescriptions,
  pendingPrescriptions,
  scheduledAppointments,
  users,
  canResetDemo,
  onResetDemo,
  loading,
}: {
  patients: number;
  records: number;
  prescriptions: number;
  pendingPrescriptions: number;
  scheduledAppointments: number;
  users: number;
  canResetDemo: boolean;
  onResetDemo: () => void;
  loading: boolean;
}) {
  return (
    <div className="stacked-workspace">
      <div className="dashboard-grid">
        <Metric label="Pacientes" value={patients} icon={<Users size={22} />} />
        <Metric label="Prontuarios" value={records} icon={<ClipboardList size={22} />} />
        <Metric label="Prescricoes" value={prescriptions} icon={<Pill size={22} />} />
        <Metric label="Pendentes" value={pendingPrescriptions} icon={<Activity size={22} />} />
        <Metric label="Consultas agendadas" value={scheduledAppointments} icon={<CalendarDays size={22} />} />
        <Metric label="Usuarios" value={users} icon={<UserCog size={22} />} />
      </div>
      {canResetDemo && (
        <section className="panel demo-admin-panel">
          <div>
            <span className="eyebrow">Ambiente de demonstracao</span>
            <h2>Restaurar dados iniciais</h2>
            <p className="helper-text">
              Recria pacientes, agenda, prontuario, prescricao, estoque e acessos de exemplo.
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={onResetDemo} disabled={loading}>
            <RotateCcw size={18} />
            Resetar demonstracao
          </button>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <article className="metric">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PatientsView({
  form,
  setForm,
  patients,
  records,
  prescriptions,
  attachments,
  attachmentForm,
  attachmentFile,
  setAttachmentForm,
  setAttachmentFile,
  canManage,
  canDelete,
  canViewPrescriptions,
  canManageAttachments,
  canDeleteAttachments,
  editingPatientId,
  selectedPatientId,
  search,
  cpfFilter,
  setSearch,
  setCpfFilter,
  onSearch,
  onSubmit,
  onEdit,
  onDelete,
  onCancelEdit,
  onSelectPatient,
  onPrintPatient,
  onCreateAttachment,
  onDeleteAttachment,
}: {
  form: PatientForm;
  setForm: (form: PatientForm) => void;
  patients: Patient[];
  records: MedicalRecord[];
  prescriptions: Prescription[];
  attachments: ClinicalAttachment[];
  attachmentForm: AttachmentForm;
  attachmentFile: File | null;
  setAttachmentForm: (form: AttachmentForm) => void;
  setAttachmentFile: (file: File | null) => void;
  canManage: boolean;
  canDelete: boolean;
  canViewPrescriptions: boolean;
  canManageAttachments: boolean;
  canDeleteAttachments: boolean;
  editingPatientId: string | null;
  selectedPatientId: string | null;
  search: string;
  cpfFilter: string;
  setSearch: (value: string) => void;
  setCpfFilter: (value: string) => void;
  onSearch: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (patient: Patient) => void;
  onDelete: (id: string) => void;
  onCancelEdit: () => void;
  onSelectPatient: (id: string) => void;
  onPrintPatient: () => void;
  onCreateAttachment: (patientId: string, event: FormEvent<HTMLFormElement>) => void;
  onDeleteAttachment: (id: string) => void;
}) {
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) ?? patients[0] ?? null;

  return (
    <div className="stacked-workspace">
      <div className={canManage ? "content-grid" : "content-grid single-column"}>
        {canManage && (
          <form className="panel form-panel" onSubmit={onSubmit}>
            <h2>{editingPatientId ? "Editar paciente" : "Novo paciente"}</h2>
            <Input label="Nome" value={form.nome} onChange={(value) => setForm({ ...form, nome: value })} required />
            <Input label="CPF" value={form.cpf} onChange={(value) => setForm({ ...form, cpf: value })} required />
            <Input label="Nascimento" type="date" value={form.data_nascimento} onChange={(value) => setForm({ ...form, data_nascimento: value })} required />
            <Input label="Telefone" value={form.telefone} onChange={(value) => setForm({ ...form, telefone: value })} required />
            <div className="form-actions">
              <button>
                <UserPlus size={18} />
                {editingPatientId ? "Salvar" : "Cadastrar"}
              </button>
              {editingPatientId && (
                <button type="button" className="secondary-button" onClick={onCancelEdit}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}

        <section className="panel table-panel">
          <div className="panel-header">
            <h2>Pacientes</h2>
            <div className="filter-bar">
              <Search size={17} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome" />
              <input value={cpfFilter} onChange={(event) => setCpfFilter(event.target.value)} placeholder="CPF" />
              <button type="button" onClick={onSearch}>Buscar</button>
            </div>
          </div>
          {patients.length === 0 ? (
            <p className="empty-state">Nenhum paciente encontrado.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF</th>
                    <th>Nascimento</th>
                    <th>Telefone</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((patient) => (
                    <tr className={patient.id === selectedPatient?.id ? "selected-row" : undefined} key={patient.id}>
                      <td>{patient.nome}</td>
                      <td>{patient.cpf}</td>
                      <td>{patient.data_nascimento}</td>
                      <td>{patient.telefone}</td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="secondary-button" onClick={() => onSelectPatient(patient.id)}>
                            <Eye size={16} />
                            Detalhes
                          </button>
                          {canManage && (
                            <button type="button" className="secondary-button" onClick={() => onEdit(patient)}>
                              <Pencil size={16} />
                              Editar
                            </button>
                          )}
                          {canDelete && (
                            <button type="button" className="danger-button" onClick={() => onDelete(patient.id)}>
                              <Trash2 size={16} />
                              Remover
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <PatientDetailPanel
        patient={selectedPatient}
        records={records}
        prescriptions={prescriptions}
        attachments={attachments}
        attachmentForm={attachmentForm}
        attachmentFile={attachmentFile}
        setAttachmentForm={setAttachmentForm}
        setAttachmentFile={setAttachmentFile}
        canViewPrescriptions={canViewPrescriptions}
        canManageAttachments={canManageAttachments}
        canDeleteAttachments={canDeleteAttachments}
        onPrint={onPrintPatient}
        onCreateAttachment={onCreateAttachment}
        onDeleteAttachment={onDeleteAttachment}
      />
    </div>
  );
}

function PatientDetailPanel({
  patient,
  records,
  prescriptions,
  attachments,
  attachmentForm,
  attachmentFile,
  setAttachmentForm,
  setAttachmentFile,
  canViewPrescriptions,
  canManageAttachments,
  canDeleteAttachments,
  onPrint,
  onCreateAttachment,
  onDeleteAttachment,
}: {
  patient: Patient | null;
  records: MedicalRecord[];
  prescriptions: Prescription[];
  attachments: ClinicalAttachment[];
  attachmentForm: AttachmentForm;
  attachmentFile: File | null;
  setAttachmentForm: (form: AttachmentForm) => void;
  setAttachmentFile: (file: File | null) => void;
  canViewPrescriptions: boolean;
  canManageAttachments: boolean;
  canDeleteAttachments: boolean;
  onPrint: () => void;
  onCreateAttachment: (patientId: string, event: FormEvent<HTMLFormElement>) => void;
  onDeleteAttachment: (id: string) => void;
}) {
  if (!patient) {
    return (
      <section className="panel detail-panel">
        <p className="empty-state">Selecione um paciente para ver o detalhe clinico.</p>
      </section>
    );
  }

  const patientRecords = records.filter((record) => record.id_paciente === patient.id);
  const recordIds = new Set(patientRecords.map((record) => record.id));
  const patientPrescriptions = prescriptions.filter(
    (prescription) =>
      prescription.id_paciente === patient.id || recordIds.has(prescription.id_prontuario),
  );
  const patientAttachments = attachments.filter((attachment) => attachment.id_paciente === patient.id);

  return (
    <section className="panel detail-panel print-patient">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Detalhe do paciente</span>
          <h2>{patient.nome}</h2>
        </div>
        <button type="button" className="secondary-button no-print" onClick={onPrint}>
          Imprimir ficha
        </button>
      </div>

      <div className="detail-grid">
        <DetailItem label="CPF" value={patient.cpf} />
        <DetailItem label="Nascimento" value={formatDate(patient.data_nascimento)} />
        <DetailItem label="Telefone" value={patient.telefone} />
        <DetailItem label="Prontuarios" value={String(patientRecords.length)} />
        {canViewPrescriptions && <DetailItem label="Prescricoes" value={String(patientPrescriptions.length)} />}
        <DetailItem label="Anexos" value={String(patientAttachments.length)} />
      </div>

      <div className="detail-sections">
        <section>
          <h3>Historico clinico</h3>
          {patientRecords.length === 0 ? (
            <p className="empty-state">Nenhum prontuario registrado para este paciente.</p>
          ) : (
            <div className="timeline-list">
              {patientRecords.map((record) => (
                <article className="timeline-item" key={record.id}>
                  <div>
                    <strong>{record.diagnostico}</strong>
                    <small>{formatDate(record.created_at)} - {record.medico_nome ?? "Medico nao informado"}</small>
                  </div>
                  {record.consulta_scheduled_at && (
                    <small>Consulta: {formatDateTime(record.consulta_scheduled_at)}</small>
                  )}
                  <p>{record.anamnese}</p>
                  {record.observacoes && <small>Observacoes: {record.observacoes}</small>}
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3>Prescricoes</h3>
          {!canViewPrescriptions ? (
            <p className="empty-state">Este perfil nao possui acesso a prescricoes.</p>
          ) : patientPrescriptions.length === 0 ? (
            <p className="empty-state">Nenhuma prescricao vinculada a este paciente.</p>
          ) : (
            <div className="compact-list">
              {patientPrescriptions.map((prescription) => (
                <article className="compact-item" key={prescription.id}>
                  <span className={`status-pill ${prescriptionStatusClass(prescription.status)}`}>
                    {prescription.status}
                  </span>
                  <strong>{prescriptionDisplayText(prescription)}</strong>
                  <small>{prescription.diagnostico ?? "Diagnostico nao informado"}</small>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3>Anexos clinicos</h3>
          {canManageAttachments && (
            <form className="attachment-form no-print" onSubmit={(event) => onCreateAttachment(patient.id, event)}>
              <label>
                Prontuario vinculado
                <select
                  value={attachmentForm.id_prontuario}
                  onChange={(event) => setAttachmentForm({ ...attachmentForm, id_prontuario: event.target.value })}
                >
                  <option value="">Paciente geral</option>
                  {patientRecords.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.diagnostico} - {formatDate(record.created_at)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo
                <select
                  value={attachmentForm.tipo}
                  onChange={(event) => setAttachmentForm({ ...attachmentForm, tipo: event.target.value as AttachmentType })}
                >
                  {attachmentTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                Origem
                <select
                  value={attachmentForm.origem}
                  onChange={(event) => {
                    setAttachmentForm({ ...attachmentForm, origem: event.target.value as AttachmentForm["origem"] });
                    setAttachmentFile(null);
                  }}
                >
                  <option value="upload">Enviar arquivo</option>
                  <option value="url">URL externa</option>
                </select>
              </label>
              <Input
                label="Titulo"
                value={attachmentForm.titulo}
                onChange={(value) => setAttachmentForm({ ...attachmentForm, titulo: value })}
                required
              />
              {attachmentForm.origem === "upload" ? (
                <label>
                  Arquivo
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                    required={!attachmentFile}
                  />
                  <small className="helper-text">
                    PDF, JPG, PNG ou WebP ate 10 MB.
                  </small>
                </label>
              ) : (
                <Input
                  label="URL do arquivo"
                  type="url"
                  value={attachmentForm.arquivo_url}
                  onChange={(value) => setAttachmentForm({ ...attachmentForm, arquivo_url: value })}
                  placeholder="https://..."
                  required
                />
              )}
              <Textarea
                label="Observacoes"
                value={attachmentForm.observacoes}
                onChange={(value) => setAttachmentForm({ ...attachmentForm, observacoes: value })}
                placeholder="Resumo do exame, laudo ou imagem"
              />
              <button type="submit">
                <Paperclip size={18} />
                Registrar anexo
              </button>
            </form>
          )}
          {patientAttachments.length === 0 ? (
            <p className="empty-state">Nenhum anexo registrado para este paciente.</p>
          ) : (
            <div className="compact-list attachment-list">
              {patientAttachments.map((attachment) => {
                const attachmentUrl = attachment.download_url ?? (
                  attachment.arquivo_url.startsWith("storage://") ? "" : attachment.arquivo_url
                );
                return (
                  <article className="compact-item attachment-item" key={attachment.id}>
                    <div>
                      <span className="status-pill neutral">{attachment.tipo}</span>
                      <strong>{attachment.titulo}</strong>
                    </div>
                    {attachment.prontuario_diagnostico && (
                      <small>Prontuario: {attachment.prontuario_diagnostico}</small>
                    )}
                    {attachment.file_name && <small>Arquivo: {attachment.file_name}</small>}
                    {attachment.observacoes && <small>Observacoes: {attachment.observacoes}</small>}
                    <small>
                      {attachment.uploaded_by_email ? `Incluido por ${attachment.uploaded_by_email}` : "Origem nao informada"} - {formatDate(attachment.created_at)}
                    </small>
                    <div className="row-actions no-print">
                      {attachmentUrl ? (
                        <a className="inline-link" href={attachmentUrl} target="_blank" rel="noreferrer">
                          <ExternalLink size={16} />
                          Abrir
                        </a>
                      ) : (
                        <span className="helper-text">Link temporario indisponivel.</span>
                      )}
                      {canDeleteAttachments && (
                        <button type="button" className="danger-button" onClick={() => onDeleteAttachment(attachment.id)}>
                          <Trash2 size={16} />
                          Remover
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RecordsView({
  form,
  setForm,
  patients,
  records,
  linkedAppointment,
  canCreate,
  patientFilter,
  startDate,
  endDate,
  setPatientFilter,
  setStartDate,
  setEndDate,
  onFilter,
  onSubmit,
}: {
  form: RecordForm;
  setForm: (form: RecordForm) => void;
  patients: Patient[];
  records: MedicalRecord[];
  linkedAppointment: Appointment | null;
  canCreate: boolean;
  patientFilter: string;
  startDate: string;
  endDate: string;
  setPatientFilter: (value: string) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  onFilter: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className={canCreate ? "content-grid" : "content-grid single-column"}>
      {canCreate && (
        <form className="panel form-panel" onSubmit={onSubmit}>
          <h2>Novo prontuario</h2>
          <label>
            Paciente
            <select
              value={form.id_paciente}
              onChange={(event) => setForm({ ...form, id_paciente: event.target.value, id_consulta: "" })}
              disabled={Boolean(form.id_consulta)}
              required
            >
              <option value="">Selecione</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>{patient.nome}</option>
              ))}
            </select>
          </label>
          {linkedAppointment && (
            <p className="helper-text">
              Vinculado a consulta realizada em {formatDateTime(linkedAppointment.scheduled_at)}.
            </p>
          )}
          <Textarea label="Anamnese" value={form.anamnese} onChange={(value) => setForm({ ...form, anamnese: value })} required />
          <Input label="Diagnostico" value={form.diagnostico} onChange={(value) => setForm({ ...form, diagnostico: value })} required />
          <Textarea label="Observacoes" value={form.observacoes} onChange={(value) => setForm({ ...form, observacoes: value })} />
          <button>Registrar prontuario</button>
        </form>
      )}

      <section className="panel table-panel">
        <div className="panel-header">
          <h2>Historico clinico</h2>
        </div>
        <div className="filter-bar table-filter">
          <select value={patientFilter} onChange={(event) => setPatientFilter(event.target.value)}>
            <option value="">Todos os pacientes</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.nome}</option>
            ))}
          </select>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Data inicial" />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Data final" />
          <button type="button" onClick={onFilter}>Filtrar</button>
        </div>
        <DataTable
          emptyText="Nenhum prontuario encontrado."
          columns={["Paciente", "Medico", "Diagnostico", "Anamnese", "Origem/Data"]}
          rows={records.map((record) => [
            patientNameForRecord(record, patients),
            record.medico_nome ?? record.id_medico,
            record.diagnostico,
            record.anamnese,
            record.consulta_scheduled_at ? `Consulta ${formatDateTime(record.consulta_scheduled_at)}` : formatDate(record.created_at),
          ])}
        />
      </section>
    </div>
  );
}

function PrescriptionsView({
  form,
  setForm,
  medicationForm,
  setMedicationForm,
  stockMovementForm,
  setStockMovementForm,
  patients,
  records,
  prescriptions,
  medications,
  stockMovements,
  canCreate,
  canDispense,
  canManageStock,
  editingPrescriptionId,
  statusFilter,
  setStatusFilter,
  onFilter,
  onSubmit,
  onDispense,
  onCreateMedication,
  onCreateStockMovement,
  onEdit,
  onCancelPrescription,
  onCancelEdit,
}: {
  form: PrescriptionForm;
  setForm: (form: PrescriptionForm) => void;
  medicationForm: MedicationForm;
  setMedicationForm: (form: MedicationForm) => void;
  stockMovementForm: StockMovementForm;
  setStockMovementForm: (form: StockMovementForm) => void;
  patients: Patient[];
  records: MedicalRecord[];
  prescriptions: Prescription[];
  medications: Medication[];
  stockMovements: StockMovement[];
  canCreate: boolean;
  canDispense: boolean;
  canManageStock: boolean;
  editingPrescriptionId: string | null;
  statusFilter: PrescriptionStatusFilter;
  setStatusFilter: (value: PrescriptionStatusFilter) => void;
  onFilter: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDispense: (id: string) => void;
  onCreateMedication: (event: FormEvent<HTMLFormElement>) => void;
  onCreateStockMovement: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (prescription: Prescription) => void;
  onCancelPrescription: (id: string) => void;
  onCancelEdit: () => void;
}) {
  const selectedMedication = medications.find((item) => item.id === form.item_medicamento_id);
  const requestedItemQuantity = Number(form.item_quantidade);
  const itemQuantityIsValid = Number.isInteger(requestedItemQuantity) && requestedItemQuantity > 0;
  const itemExceedsStock = Boolean(
    selectedMedication && itemQuantityIsValid && requestedItemQuantity > selectedMedication.quantidade,
  );
  const selectedMedicationInactive = Boolean(selectedMedication && !selectedMedication.ativo);
  const canAddPrescriptionItem = Boolean(
    selectedMedication
      && selectedMedication.ativo
      && itemQuantityIsValid
      && requestedItemQuantity <= selectedMedication.quantidade
      && form.item_posologia.trim(),
  );

  function addPrescriptionItem() {
    if (!selectedMedication || !canAddPrescriptionItem) {
      return;
    }
    setForm({
      ...form,
      item_medicamento_id: "",
      item_quantidade: "1",
      item_posologia: "",
      itens: [
        ...form.itens,
        {
          id_medicamento: selectedMedication.id,
          quantidade: requestedItemQuantity,
          posologia: form.item_posologia.trim(),
          medicamento_nome: selectedMedication.nome,
          medicamento_apresentacao: selectedMedication.apresentacao,
        },
      ],
    });
  }

  function removePrescriptionItem(indexToRemove: number) {
    setForm({
      ...form,
      itens: form.itens.filter((_, index) => index !== indexToRemove),
    });
  }

  return (
    <div className="stacked-workspace">
      <div className={canCreate ? "content-grid" : "content-grid single-column"}>
        {canCreate && (
          <form className="panel form-panel" onSubmit={onSubmit}>
            <h2>{editingPrescriptionId ? "Editar prescricao" : "Nova prescricao"}</h2>
            {editingPrescriptionId ? (
              <p className="helper-text">Editando medicamentos de uma prescricao pendente.</p>
            ) : (
              <label>
                Prontuario
                <select value={form.id_prontuario} onChange={(event) => setForm({ ...form, id_prontuario: event.target.value })} required>
                  <option value="">Selecione</option>
                  {records.map((record) => (
                    <option key={record.id} value={record.id}>{recordOptionLabel(record, patients)}</option>
                  ))}
                </select>
              </label>
            )}
            <Textarea
              label="Medicamentos livres"
              value={form.medicamentos}
              onChange={(value) => setForm({ ...form, medicamentos: value })}
              placeholder="Um medicamento por linha, se nao usar itens do estoque"
              required={form.itens.length === 0}
            />
            <div className="structured-items">
              <span className="helper-text">Itens vinculados ao estoque</span>
              <div className="inline-form">
                <label>
                  Medicamento
                  <select
                    value={form.item_medicamento_id}
                    onChange={(event) => setForm({ ...form, item_medicamento_id: event.target.value })}
                  >
                    <option value="">Selecione</option>
                    {medications.map((medication) => (
                      <option key={medication.id} value={medication.id}>
                        {medicationLabel(medication)} - {medication.quantidade} disp.
                        {!medication.ativo ? " (inativo)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Quantidade"
                  type="number"
                  value={form.item_quantidade}
                  onChange={(value) => setForm({ ...form, item_quantidade: value })}
                  min="1"
                  step="1"
                />
                <Input
                  label="Posologia"
                  value={form.item_posologia}
                  onChange={(value) => setForm({ ...form, item_posologia: value })}
                  placeholder="Tomar 1 comp. a cada 8h"
                />
                <button type="button" className="secondary-button" onClick={addPrescriptionItem} disabled={!canAddPrescriptionItem}>
                  Adicionar item
                </button>
              </div>
              {selectedMedication && (
                <p className="helper-text">
                  Disponivel: {selectedMedication.quantidade} unidade(s).
                  {selectedMedicationInactive && " Medicamento inativo nao pode ser prescrito."}
                  {itemExceedsStock && " Quantidade acima do estoque disponivel."}
                </p>
              )}
              {form.itens.length > 0 && (
                <div className="compact-list">
                  {form.itens.map((item, index) => (
                    <article className="compact-item" key={`${item.id_medicamento}-${index}`}>
                      <strong>{prescriptionItemLabel(item)}</strong>
                      <small>Qtd. {item.quantidade} - {item.posologia}</small>
                      <button type="button" className="danger-button" onClick={() => removePrescriptionItem(index)}>
                        Remover
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="form-actions">
              <button>{editingPrescriptionId ? "Salvar" : "Criar prescricao"}</button>
              {editingPrescriptionId && (
                <button type="button" className="secondary-button" onClick={onCancelEdit}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}

        <section className="panel table-panel">
          <div className="panel-header">
            <h2>Fila da farmacia</h2>
          </div>
          <div className="filter-bar table-filter">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as PrescriptionStatusFilter)}
            >
              <option value="">Todos os status</option>
              <option value="Pendente">Pendentes</option>
              <option value="Entregue">Entregues</option>
              <option value="Cancelada">Canceladas</option>
            </select>
            <button type="button" onClick={onFilter}>Filtrar</button>
          </div>
          {prescriptions.length === 0 ? (
            <p className="empty-state">Nenhuma prescricao encontrada.</p>
          ) : (
            <div className="prescription-list">
              {prescriptions.map((prescription) => (
                <article key={prescription.id} className="prescription-item">
                  <div>
                    <strong>{prescription.paciente_nome ?? "Paciente nao identificado"}</strong>
                    <span>{prescriptionDisplayText(prescription)}</span>
                    <small>Status: {prescription.status}</small>
                    <small>Diagnostico: {prescription.diagnostico ?? "Nao informado"}</small>
                    <small>Medico: {prescription.medico_nome ?? "Nao informado"}</small>
                  </div>
                  {prescription.status === "Pendente" && (
                    <div className="row-actions">
                      {canCreate && (
                        <>
                          <button type="button" className="secondary-button" onClick={() => onEdit(prescription)}>
                            <Pencil size={16} />
                            Editar
                          </button>
                          <button type="button" className="danger-button" onClick={() => onCancelPrescription(prescription.id)}>
                            <XCircle size={16} />
                            Cancelar
                          </button>
                        </>
                      )}
                      {canDispense && (
                        <button type="button" className="secondary-button" onClick={() => onDispense(prescription.id)}>
                          Dispensar
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <MedicationInventoryPanel
        medications={medications}
        stockMovements={stockMovements}
        medicationForm={medicationForm}
        setMedicationForm={setMedicationForm}
        stockMovementForm={stockMovementForm}
        setStockMovementForm={setStockMovementForm}
        canManageStock={canManageStock}
        onCreateMedication={onCreateMedication}
        onCreateStockMovement={onCreateStockMovement}
      />
    </div>
  );
}

function MedicationInventoryPanel({
  medications,
  stockMovements,
  medicationForm,
  setMedicationForm,
  stockMovementForm,
  setStockMovementForm,
  canManageStock,
  onCreateMedication,
  onCreateStockMovement,
}: {
  medications: Medication[];
  stockMovements: StockMovement[];
  medicationForm: MedicationForm;
  setMedicationForm: (form: MedicationForm) => void;
  stockMovementForm: StockMovementForm;
  setStockMovementForm: (form: StockMovementForm) => void;
  canManageStock: boolean;
  onCreateMedication: (event: FormEvent<HTMLFormElement>) => void;
  onCreateStockMovement: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="panel table-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Controle da farmacia</span>
          <h2>Estoque de medicamentos</h2>
        </div>
      </div>

      {canManageStock && (
        <div className="inventory-forms">
          <form className="inline-form" onSubmit={onCreateMedication}>
            <Input label="Medicamento" value={medicationForm.nome} onChange={(value) => setMedicationForm({ ...medicationForm, nome: value })} required />
            <Input label="Apresentacao" value={medicationForm.apresentacao} onChange={(value) => setMedicationForm({ ...medicationForm, apresentacao: value })} placeholder="500mg, frasco, ampola" required />
            <Input label="Qtd. inicial" type="number" value={medicationForm.quantidade} onChange={(value) => setMedicationForm({ ...medicationForm, quantidade: value })} required />
            <Input label="Estoque minimo" type="number" value={medicationForm.estoque_minimo} onChange={(value) => setMedicationForm({ ...medicationForm, estoque_minimo: value })} required />
            <button type="submit">Cadastrar medicamento</button>
          </form>

          <form className="inline-form" onSubmit={onCreateStockMovement}>
            <label>
              Medicamento
              <select
                value={stockMovementForm.id_medicamento}
                onChange={(event) => setStockMovementForm({ ...stockMovementForm, id_medicamento: event.target.value })}
                required
              >
                <option value="">Selecione</option>
                {medications.map((medication) => (
                  <option key={medication.id} value={medication.id}>
                    {medicationLabel(medication)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Movimento
              <select
                value={stockMovementForm.tipo}
                onChange={(event) => setStockMovementForm({ ...stockMovementForm, tipo: event.target.value as StockMovementForm["tipo"] })}
              >
                <option value="Entrada">Entrada</option>
                <option value="Saida">Saida</option>
              </select>
            </label>
            <Input label="Quantidade" type="number" value={stockMovementForm.quantidade} onChange={(value) => setStockMovementForm({ ...stockMovementForm, quantidade: value })} required />
            <Input label="Observacoes" value={stockMovementForm.observacoes} onChange={(value) => setStockMovementForm({ ...stockMovementForm, observacoes: value })} />
            <button type="submit">Movimentar estoque</button>
          </form>
        </div>
      )}

      {medications.length === 0 ? (
        <p className="empty-state">Nenhum medicamento cadastrado.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Medicamento</th>
                <th>Quantidade</th>
                <th>Minimo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {medications.map((medication) => (
                <tr key={medication.id}>
                  <td>
                    <strong>{medication.nome}</strong>
                    <small className="table-note">{medication.apresentacao}</small>
                  </td>
                  <td>{medication.quantidade}</td>
                  <td>{medication.estoque_minimo}</td>
                  <td>
                    <span className={`status-pill ${medication.baixo_estoque ? "pending" : "done"}`}>
                      {medication.baixo_estoque ? "Baixo estoque" : "OK"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel-subsection">
        <h3>Movimentacoes recentes</h3>
        {stockMovements.length === 0 ? (
          <p className="empty-state">Nenhuma movimentacao registrada.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Medicamento</th>
                  <th>Tipo</th>
                  <th>Qtd.</th>
                  <th>Estoque</th>
                  <th>Responsavel</th>
                </tr>
              </thead>
              <tbody>
                {stockMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatDateTime(movement.created_at)}</td>
                    <td>
                      <strong>{stockMovementMedicationLabel(movement)}</strong>
                      {movement.observacoes && <small className="table-note">{movement.observacoes}</small>}
                    </td>
                    <td>
                      <span className={`status-pill ${movement.tipo === "Entrada" ? "done" : "pending"}`}>
                        {movement.tipo}
                      </span>
                    </td>
                    <td>{movement.quantidade}</td>
                    <td>{movement.quantidade_anterior} para {movement.quantidade_atual}</td>
                    <td>{movement.created_by_email ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function AppointmentsView({
  form,
  setForm,
  appointments,
  patients,
  doctors,
  records,
  canManage,
  canEdit,
  canCreateRecord,
  canUpdateStatus,
  editingAppointmentId,
  patientFilter,
  doctorFilter,
  statusFilter,
  startDate,
  endDate,
  setPatientFilter,
  setDoctorFilter,
  setStatusFilter,
  setStartDate,
  setEndDate,
  onFilter,
  onSubmit,
  onEdit,
  onCancelEdit,
  onCreateRecord,
  onStatusChange,
}: {
  form: AppointmentForm;
  setForm: (form: AppointmentForm) => void;
  appointments: Appointment[];
  patients: Patient[];
  doctors: AppUser[];
  records: MedicalRecord[];
  canManage: boolean;
  canEdit: boolean;
  canCreateRecord: boolean;
  canUpdateStatus: boolean;
  editingAppointmentId: string | null;
  patientFilter: string;
  doctorFilter: string;
  statusFilter: AppointmentStatusFilter;
  startDate: string;
  endDate: string;
  setPatientFilter: (value: string) => void;
  setDoctorFilter: (value: string) => void;
  setStatusFilter: (value: AppointmentStatusFilter) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  onFilter: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (appointment: Appointment) => void;
  onCancelEdit: () => void;
  onCreateRecord: (appointment: Appointment) => void;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
}) {
  return (
    <div className={canManage ? "content-grid" : "content-grid single-column"}>
      {canManage && (
        <form className="panel form-panel" onSubmit={onSubmit}>
          <h2>{editingAppointmentId ? "Editar consulta" : "Nova consulta"}</h2>
          <label>
            Paciente
            <select value={form.id_paciente} onChange={(event) => setForm({ ...form, id_paciente: event.target.value })} required>
              <option value="">Selecione</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>{patient.nome}</option>
              ))}
            </select>
          </label>
          <label>
            Medico
            <select value={form.id_medico} onChange={(event) => setForm({ ...form, id_medico: event.target.value })} required>
              <option value="">Selecione</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>{doctorLabel(doctor)}</option>
              ))}
            </select>
          </label>
          <Input
            label="Data e hora"
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(value) => setForm({ ...form, scheduled_at: value })}
            required
          />
          {editingAppointmentId && (
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value as AppointmentStatus })}
                required
              >
                <option value="Agendada">Agendada</option>
                <option value="Realizada">Realizada</option>
                <option value="Cancelada">Cancelada</option>
              </select>
            </label>
          )}
          <Textarea
            label="Observacoes"
            value={form.observacoes}
            onChange={(value) => setForm({ ...form, observacoes: value })}
            placeholder="Motivo, preparo ou informacoes para atendimento"
          />
          <div className="form-actions">
            <button>
              <CalendarDays size={18} />
              {editingAppointmentId ? "Salvar" : "Agendar"}
            </button>
            {editingAppointmentId && (
              <button type="button" className="secondary-button" onClick={onCancelEdit}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      <section className="panel table-panel">
        <div className="panel-header">
          <h2>Agenda de consultas</h2>
        </div>
        <div className="filter-bar table-filter">
          <select value={patientFilter} onChange={(event) => setPatientFilter(event.target.value)}>
            <option value="">Todos os pacientes</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.nome}</option>
            ))}
          </select>
          <select value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)}>
            <option value="">Todos os medicos</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>{doctorLabel(doctor)}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AppointmentStatusFilter)}>
            <option value="">Todos os status</option>
            <option value="Agendada">Agendadas</option>
            <option value="Realizada">Realizadas</option>
            <option value="Cancelada">Canceladas</option>
          </select>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Data inicial" />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Data final" />
          <button type="button" onClick={onFilter}>Filtrar</button>
        </div>

        {appointments.length === 0 ? (
          <p className="empty-state">Nenhuma consulta encontrada.</p>
        ) : (
          <div className="appointment-list">
            {appointments.map((appointment) => (
              <AppointmentItem
                key={appointment.id}
                appointment={appointment}
                patients={patients}
                doctors={doctors}
                linkedRecord={records.find((record) => record.id_consulta === appointment.id) ?? null}
                canEdit={canEdit}
                canCreateRecord={canCreateRecord}
                canUpdateStatus={canUpdateStatus}
                onEdit={onEdit}
                onCreateRecord={onCreateRecord}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AppointmentItem({
  appointment,
  patients,
  doctors,
  linkedRecord,
  canEdit,
  canCreateRecord,
  canUpdateStatus,
  onEdit,
  onCreateRecord,
  onStatusChange,
}: {
  appointment: Appointment;
  patients: Patient[];
  doctors: AppUser[];
  linkedRecord: MedicalRecord | null;
  canEdit: boolean;
  canCreateRecord: boolean;
  canUpdateStatus: boolean;
  onEdit: (appointment: Appointment) => void;
  onCreateRecord: (appointment: Appointment) => void;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
}) {
  return (
    <article className="appointment-item">
      <div>
        <span className={`status-pill ${appointmentStatusClass(appointment.status)}`}>
          {appointment.status}
        </span>
        <strong>{appointment.paciente_nome ?? findPatientName(patients, appointment.id_paciente)}</strong>
        <small>{formatDateTime(appointment.scheduled_at)}</small>
        <small>Medico: {appointment.medico_nome ?? findDoctorName(doctors, appointment.id_medico)}</small>
        {appointment.observacoes && <small>Obs.: {appointment.observacoes}</small>}
        {linkedRecord && <small>Prontuario criado: {linkedRecord.diagnostico}</small>}
      </div>
      <div className="row-actions">
        {canEdit && (
          <button type="button" className="secondary-button" onClick={() => onEdit(appointment)}>
            <Pencil size={16} />
            Editar
          </button>
        )}
        {canUpdateStatus && appointment.status === "Agendada" && (
          <>
            <button type="button" className="secondary-button" onClick={() => onStatusChange(appointment.id, "Realizada")}>
              Realizada
            </button>
            <button type="button" className="danger-button" onClick={() => onStatusChange(appointment.id, "Cancelada")}>
              <XCircle size={16} />
              Cancelar
            </button>
          </>
        )}
        {canCreateRecord && appointment.status === "Realizada" && !linkedRecord && (
          <button type="button" className="secondary-button" onClick={() => onCreateRecord(appointment)}>
            <ClipboardList size={16} />
            Gerar prontuario
          </button>
        )}
      </div>
    </article>
  );
}

function UsersView({
  form,
  setForm,
  users,
  currentUserId,
  editingUserId,
  search,
  roleFilter,
  activeFilter,
  setSearch,
  setRoleFilter,
  setActiveFilter,
  onFilter,
  onSubmit,
  onEdit,
  onCancelEdit,
}: {
  form: UserForm;
  setForm: (form: UserForm) => void;
  users: AppUser[];
  currentUserId: string;
  editingUserId: string | null;
  search: string;
  roleFilter: UserRoleFilter;
  activeFilter: ActiveFilter;
  setSearch: (value: string) => void;
  setRoleFilter: (value: UserRoleFilter) => void;
  setActiveFilter: (value: ActiveFilter) => void;
  onFilter: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (user: AppUser) => void;
  onCancelEdit: () => void;
}) {
  const isEditingSelf = editingUserId === currentUserId;

  return (
    <div className="content-grid">
      <form className="panel form-panel" onSubmit={onSubmit}>
        <h2>{editingUserId ? "Editar usuario" : "Novo usuario"}</h2>
        {isEditingSelf && (
          <p className="helper-text">Perfil e status da propria conta ficam protegidos.</p>
        )}
        <Input label="Nome" value={form.nome} onChange={(value) => setForm({ ...form, nome: value })} />
        <Input label="E-mail" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} required />
        <Input
          label={editingUserId ? "Nova senha" : "Senha"}
          type="password"
          value={form.senha}
          onChange={(value) => setForm({ ...form, senha: value })}
          required={!editingUserId}
        />
        <label>
          Perfil
          <select
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
            disabled={isEditingSelf}
            required
          >
            <option value="admin">Admin</option>
            <option value="medico">Medico</option>
            <option value="farmaceutico">Farmacia</option>
            <option value="recepcao">Recepcao</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.ativo}
            onChange={(event) => setForm({ ...form, ativo: event.target.checked })}
            disabled={isEditingSelf}
          />
          Usuario ativo
        </label>
        <div className="form-actions">
          <button>
            <UserCog size={18} />
            {editingUserId ? "Salvar" : "Criar usuario"}
          </button>
          {editingUserId && (
            <button type="button" className="secondary-button" onClick={onCancelEdit}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <section className="panel table-panel">
        <div className="panel-header">
          <h2>Usuarios</h2>
        </div>
        <div className="filter-bar table-filter">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por e-mail" />
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRoleFilter)}>
            <option value="">Todos os perfis</option>
            <option value="admin">Admin</option>
            <option value="medico">Medico</option>
            <option value="farmaceutico">Farmacia</option>
            <option value="recepcao">Recepcao</option>
          </select>
          <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}>
            <option value="">Todos os status</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
          <button type="button" onClick={onFilter}>Filtrar</button>
        </div>
        {users.length === 0 ? (
          <p className="empty-state">Nenhum usuario encontrado.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.nome || "-"}</td>
                    <td>{user.email}</td>
                    <td>{roleLabel(user.role)}</td>
                    <td>
                      <span className={user.ativo ? "status-pill active" : "status-pill inactive"}>
                        {user.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="secondary-button" onClick={() => onEdit(user)}>
                          <Pencil size={16} />
                          Editar
                        </button>
                        {user.id === currentUserId && <span className="helper-text">Conta atual</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AuditView({
  logs,
  actionFilter,
  resourceFilter,
  actorFilter,
  startDate,
  endDate,
  setActionFilter,
  setResourceFilter,
  setActorFilter,
  setStartDate,
  setEndDate,
  onFilter,
}: {
  logs: AuditLog[];
  actionFilter: AuditActionFilter;
  resourceFilter: AuditResourceFilter;
  actorFilter: string;
  startDate: string;
  endDate: string;
  setActionFilter: (value: AuditActionFilter) => void;
  setResourceFilter: (value: AuditResourceFilter) => void;
  setActorFilter: (value: string) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  onFilter: () => void;
}) {
  return (
    <section className="panel table-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Rastreabilidade</span>
          <h2>Auditoria operacional</h2>
        </div>
      </div>
      <div className="filter-bar table-filter">
        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value as AuditActionFilter)}>
          <option value="">Todas as acoes</option>
          {auditActions.map((action) => (
            <option key={action} value={action}>{auditActionLabel(action)}</option>
          ))}
        </select>
        <select value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value as AuditResourceFilter)}>
          <option value="">Todos os recursos</option>
          {auditResources.map((resource) => (
            <option key={resource} value={resource}>{auditResourceLabel(resource)}</option>
          ))}
        </select>
        <input value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} placeholder="E-mail do usuario" />
        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Data inicial" />
        <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Data final" />
        <button type="button" onClick={onFilter}>Filtrar</button>
      </div>

      {logs.length === 0 ? (
        <p className="empty-state">Nenhum evento de auditoria encontrado.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Usuario</th>
                <th>Perfil</th>
                <th>Acao</th>
                <th>Recurso</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{log.actor_email}</td>
                  <td>{auditRoleLabel(log.actor_role)}</td>
                  <td>{auditActionLabel(log.action)}</td>
                  <td>
                    <span>{auditResourceLabel(log.resource_type)}</span>
                    {log.resource_id && <small className="table-note">{shortId(log.resource_id)}</small>}
                  </td>
                  <td>{auditMetadataLabel(log.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReportsView({
  report,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  onFilter,
  onExport,
  onPrint,
}: {
  report: IndicatorsReport | null;
  startDate: string;
  endDate: string;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  onFilter: () => void;
  onExport: () => void;
  onPrint: () => void;
}) {
  if (!report) {
    return (
      <section className="panel">
        <p className="empty-state">Nenhum indicador carregado.</p>
      </section>
    );
  }

  return (
    <div className="stacked-workspace print-report">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Relatorios gerenciais</span>
            <h2>Indicadores do periodo</h2>
          </div>
        </div>
        <div className="filter-bar table-filter">
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Data inicial" />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Data final" />
          <button type="button" onClick={onFilter}>Atualizar relatorio</button>
          <button type="button" className="secondary-button" onClick={onExport}>Exportar CSV</button>
          <button type="button" className="secondary-button no-print" onClick={onPrint}>Imprimir relatorio</button>
        </div>
        <p className="helper-text">{reportPeriodLabel(report)}</p>
      </section>

      <div className="dashboard-grid">
        <Metric label="Pacientes" value={report.totals.pacientes} icon={<Users size={22} />} />
        <Metric label="Prontuarios" value={report.totals.prontuarios} icon={<ClipboardList size={22} />} />
        <Metric label="Prescricoes" value={report.totals.prescricoes} icon={<Pill size={22} />} />
        <Metric label="Pendentes" value={report.totals.prescricoes_pendentes} icon={<Activity size={22} />} />
        <Metric label="Consultas" value={report.totals.consultas} icon={<CalendarDays size={22} />} />
        <Metric label="Agendadas" value={report.totals.consultas_agendadas} icon={<Activity size={22} />} />
        <Metric label="Medicamentos" value={report.totals.medicamentos} icon={<Pill size={22} />} />
        <Metric label="Baixo estoque" value={report.totals.medicamentos_baixo_estoque} icon={<Activity size={22} />} />
        <Metric label="Mov. estoque" value={report.totals.movimentacoes_estoque} icon={<BarChart3 size={22} />} />
        <Metric label="Usuarios ativos" value={report.totals.usuarios_ativos} icon={<UserCog size={22} />} />
      </div>

      <div className="reports-grid">
        <ReportChart title="Prescricoes por status" buckets={report.prescriptions_by_status} />
        <ReportChart title="Consultas por status" buckets={report.appointments_by_status} />
        <ReportChart title="Movimentacoes de estoque por tipo" buckets={report.stock_movements_by_type} />
        <ReportChart title="Pacientes por mes" buckets={report.patients_by_month} emptyText="Sem pacientes no periodo." />
        <ReportChart title="Prontuarios por dia" buckets={report.records_by_day} emptyText="Sem prontuarios no periodo." />
        <ReportChart title="Consultas por dia" buckets={report.appointments_by_day} emptyText="Sem consultas no periodo." />
        <ReportChart title="Movimentacoes de estoque por dia" buckets={report.stock_movements_by_day} emptyText="Sem movimentacoes no periodo." />
        <ReportChart title="Principais diagnosticos" buckets={report.top_diagnoses} emptyText="Sem diagnosticos no periodo." />
      </div>
    </div>
  );
}

function ReportChart({
  title,
  buckets,
  emptyText = "Sem dados no periodo.",
}: {
  title: string;
  buckets: { label: string; value: number }[];
  emptyText?: string;
}) {
  const maxValue = Math.max(...buckets.map((bucket) => bucket.value), 0);

  return (
    <section className="panel report-card">
      <h2>{title}</h2>
      {buckets.length === 0 || maxValue === 0 ? (
        <p className="empty-state">{emptyText}</p>
      ) : (
        <div className="bar-list">
          {buckets.map((bucket) => (
            <div className="bar-item" key={bucket.label}>
              <div>
                <span>{bucket.label}</span>
                <strong>{bucket.value}</strong>
              </div>
              <div className="bar-track">
                <span style={{ width: `${(bucket.value / maxValue) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DataTable({
  columns,
  rows,
  emptyText,
}: {
  columns: string[];
  rows: string[][];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="empty-state">{emptyText}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.join("-")}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <label>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        step={step}
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

function findPatientName(patients: Patient[], id: string) {
  return patients.find((patient) => patient.id === id)?.nome ?? id;
}

function patientNameForRecord(record: MedicalRecord, patients: Patient[]) {
  return record.paciente_nome ?? findPatientName(patients, record.id_paciente);
}

function recordOptionLabel(record: MedicalRecord, patients: Patient[]) {
  return `${patientNameForRecord(record, patients)} - ${record.diagnostico}`;
}

function doctorLabel(doctor: AppUser) {
  return doctor.nome ? `${doctor.nome} (${doctor.email})` : doctor.email;
}

function medicationLabel(medication: Medication) {
  return `${medication.nome} ${medication.apresentacao}`.trim();
}

function stockMovementMedicationLabel(movement: StockMovement) {
  return `${movement.medicamento_nome ?? "Medicamento"} ${movement.medicamento_apresentacao ?? ""}`.trim();
}

function prescriptionItemLabel(item: PrescriptionItem) {
  return `${item.medicamento_nome ?? "Medicamento"} ${item.medicamento_apresentacao ?? ""}`.trim();
}

function prescriptionDisplayText(prescription: Prescription) {
  if (prescription.itens?.length) {
    return prescription.itens
      .map((item) => `${prescriptionItemLabel(item)} x${item.quantidade}`)
      .join(", ");
  }
  return prescription.medicamentos.join(", ");
}

function findDoctorName(doctors: AppUser[], id: string) {
  const doctor = doctors.find((item) => item.id === id);
  return doctor ? doctorLabel(doctor) : id;
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    "patient.create": "Paciente criado",
    "patient.update": "Paciente atualizado",
    "patient.delete": "Paciente removido",
    "medical_record.create": "Prontuario criado",
    "medical_record.update": "Prontuario atualizado",
    "prescription.create": "Prescricao criada",
    "prescription.update": "Prescricao atualizada",
    "prescription.dispense": "Prescricao dispensada",
    "medication.create": "Medicamento criado",
    "medication.update": "Medicamento atualizado",
    "medication.stock_movement": "Movimento de estoque",
    "appointment.create": "Consulta criada",
    "appointment.update": "Consulta atualizada",
    "attachment.create": "Anexo criado",
    "attachment.upload": "Anexo enviado",
    "attachment.delete": "Anexo removido",
    "user.create": "Usuario criado",
    "user.update": "Usuario atualizado",
  };
  return labels[action] ?? action;
}

function auditResourceLabel(resource: string) {
  const labels: Record<string, string> = {
    patient: "Paciente",
    medical_record: "Prontuario",
    prescription: "Prescricao",
    medication: "Medicamento",
    appointment: "Consulta",
    attachment: "Anexo",
    user: "Usuario",
  };
  return labels[resource] ?? resource;
}

function auditRoleLabel(role: string) {
  return ["admin", "medico", "farmaceutico", "recepcao"].includes(role)
    ? roleLabel(role as UserRole)
    : role;
}

function auditMetadataLabel(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (entries.length === 0) {
    return "-";
  }
  return entries
    .map(([key, value]) => `${auditMetadataKeyLabel(key)}: ${String(value)}`)
    .join(" | ");
}

function auditMetadataKeyLabel(key: string) {
  const labels: Record<string, string> = {
    id_paciente: "Paciente",
    id_medico: "Medico",
    id_consulta: "Consulta",
    id_prontuario: "Prontuario",
    tipo: "Tipo",
    file_name: "Arquivo",
    scheduled_at: "Agendado para",
    status: "Status",
    target_email: "Usuario",
    target_role: "Perfil",
    target_active: "Ativo",
    nome: "Nome",
    quantidade: "Quantidade",
    quantidade_atual: "Estoque atual",
  };
  return labels[key] ?? key;
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function prescriptionStatusClass(status: Prescription["status"]) {
  const classes = {
    Pendente: "pending",
    Entregue: "done",
    Cancelada: "cancelled",
  };
  return classes[status];
}

function appointmentStatusClass(status: AppointmentStatus) {
  const classes = {
    Agendada: "pending",
    Realizada: "done",
    Cancelada: "cancelled",
  };
  return classes[status];
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
  }
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function toDateTimeLocal(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function toApiDateTime(value: string) {
  return new Date(value).toISOString();
}

function titleFor(view: View) {
  const titles = {
    dashboard: "Painel",
    patients: "Pacientes",
    records: "Prontuarios",
    prescriptions: "Farmacia",
    appointments: "Agenda",
    users: "Usuarios",
    reports: "Relatorios",
    audit: "Auditoria",
  };
  return titles[view];
}

function emptyPage<T>(): PaginatedResponse<T> {
  return { items: [], limit: 20, offset: 0 };
}

function buildQuery(params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function printCurrentView(target: "patient" | "report") {
  const modeClass = target === "patient" ? "print-patient-mode" : "print-report-mode";
  const cleanup = () => {
    document.body.classList.remove("print-mode", modeClass);
    window.removeEventListener("afterprint", cleanup);
  };

  document.body.classList.add("print-mode", modeClass);
  window.addEventListener("afterprint", cleanup);
  window.print();
}

function canAccessRecords(role: UserRole) {
  return ["admin", "medico", "recepcao"].includes(role);
}

function canAccessPrescriptions(role: UserRole) {
  return ["admin", "medico", "farmaceutico"].includes(role);
}

function canAccessMedications(role: UserRole) {
  return ["admin", "medico", "farmaceutico"].includes(role);
}

function canAccessAppointments(role: UserRole) {
  return ["admin", "medico", "recepcao"].includes(role);
}

function canAccessAttachments(role: UserRole) {
  return ["admin", "medico", "recepcao"].includes(role);
}

function canAccessPatients(role: UserRole) {
  return ["admin", "medico", "recepcao"].includes(role);
}

function canAccessUsers(role: UserRole) {
  return role === "admin";
}

function canAccessReports(role: UserRole) {
  return role === "admin";
}

function canAccessAudit(role: UserRole) {
  return role === "admin";
}

function canManagePatients(role: UserRole) {
  return ["admin", "recepcao"].includes(role);
}

function canManageAppointments(role: UserRole) {
  return ["admin", "recepcao"].includes(role);
}

function canManageMedications(role: UserRole) {
  return ["admin", "farmaceutico"].includes(role);
}

function canManageAttachments(role: UserRole) {
  return ["admin", "medico", "recepcao"].includes(role);
}

function canDeleteAttachments(role: UserRole) {
  return role === "admin";
}

function isViewAllowed(view: View, role: UserRole) {
  if (view === "patients") {
    return canAccessPatients(role);
  }
  if (view === "records") {
    return canAccessRecords(role);
  }
  if (view === "prescriptions") {
    return canAccessPrescriptions(role);
  }
  if (view === "appointments") {
    return canAccessAppointments(role);
  }
  if (view === "users") {
    return canAccessUsers(role);
  }
  if (view === "reports") {
    return canAccessReports(role);
  }
  if (view === "audit") {
    return canAccessAudit(role);
  }
  return true;
}

function reportPeriodLabel(report: IndicatorsReport) {
  const from = report.period.created_from ? formatDate(report.period.created_from) : "inicio";
  const to = report.period.created_to ? formatDate(report.period.created_to) : "hoje";
  return `Periodo analisado: ${from} a ${to}.`;
}

function roleLabel(role: UserRole) {
  const labels: Record<UserRole, string> = {
    admin: "Admin",
    medico: "Medico",
    farmaceutico: "Farmacia",
    recepcao: "Recepcao",
  };
  return labels[role];
}

export default App;
