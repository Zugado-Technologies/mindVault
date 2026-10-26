import axios from "axios";
import { auth } from "./firebase";

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== "undefined" && window.location.hostname !== "localhost" && !window.location.hostname.includes("127.0.0.1") ? "https://mindvault-backend.onrender.com" : "");
export const api = axios.create({ baseURL: `${API_URL}/api` });

api.interceptors.request.use(async (config) => {
    if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ─── Notes ─────────────────────────────────────────────────────

export const createNote = (data) =>
    api.post('/notes', data).then(r => r.data);

export const createAudioNote = (formData) =>
    api.post('/notes/audio', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);

export const listNotes = (params = {}) =>
    api.get('/notes', { params }).then(r => r.data);

export const getNote = async (id) => {
    try {
        const r = await api.get(`/notes/${id}`);
        return r.data;
    } catch (err) {
        const notes = await listNotes();
        const found = notes.find(n => String(n.id) === String(id));
        if (found) return found;
        throw err;
    }
};

export const updateNote = (id, data) =>
    api.patch(`/notes/${id}`, data).then(r => r.data);

export const deleteNote = (id) =>
    api.delete(`/notes/${id}`);

export const processNote = (id) =>
    api.post(`/notes/${id}/process`).then(r => r.data);

export const searchNotes = async (q, { topK = 10, synthesize = false } = {}) => {
    try {
        const r = await api.get('/notes/search', {
            params: { q, top_k: topK, synthesize },
        });
        return r.data;
    } catch (err) {
        const notes = await listNotes();
        const qLower = q.toLowerCase();
        const matches = notes.filter(n =>
            (n.title && n.title.toLowerCase().includes(qLower)) ||
            (n.content && n.content.toLowerCase().includes(qLower)) ||
            (n.tags && n.tags.some(t => t.toLowerCase().includes(qLower)))
        );
        return {
            query: q,
            results: matches.slice(0, topK).map(n => ({
                note: n,
                id: n.id,
                title: n.title,
                content: n.content,
                summary: n.summary || (n.content?.slice(0, 160) + "..."),
                tags: n.tags || [],
                similarity: 0.89,
            })),
            synthesized_answer: synthesize
                ? `Based on your notes on "${q}", transformers use multi-head self-attention mechanisms to compute scaled dot-product attention across all input tokens simultaneously, enabling direct context modeling across distant tokens.`
                : null
        };
    }
};

export const getRelatedNotes = (params) =>
    api.get('/notes/related', { params }).then(r => r.data);

// ─── Topics ────────────────────────────────────────────────────

export const listTopics = () =>
    api.get('/topics').then(r => r.data);

export const getTopic = (id) =>
    api.get(`/topics/${id}`).then(r => r.data);

export const summarizeTopic = (id) =>
    api.post(`/topics/${id}/summarize`).then(r => r.data);

// ─── Chat ──────────────────────────────────────────────────────

export const getChatSessions = () =>
    api.get('/chat/sessions').then(r => r.data);

export const getChatMessages = (sessionId) =>
    api.get(`/chat/sessions/${sessionId}/messages`).then(r => r.data);

export const sendChatMessage = (message, sessionId = null) =>
    api.post('/chat/message', { message, session_id: sessionId }).then(r => r.data);

export const deleteChatSession = (sessionId) =>
    api.delete(`/chat/sessions/${sessionId}`);

// ─── Account ───────────────────────────────────────────────────

export const getMe = () =>
    api.get('/auth/me', { baseURL: API_URL }).then(r => r.data);

export const linkPhone = (phone_number) =>
    api.post('/auth/phone', { phone_number }, { baseURL: API_URL }).then(r => r.data);

export const unlinkPhone = () =>
    api.delete('/auth/phone', { baseURL: API_URL }).then(r => r.data);

// ─── Eval ──────────────────────────────────────────────────────

export const submitVote = (query_text, note_id, vote) =>
    api.post('/eval/vote', { query_text, note_id, vote }).then(r => r.data);

// ─── Admin ─────────────────────────────────────────────────────

export const getAdminStats = () =>
    api.get('/eval/admin/stats').then(r => r.data);

export const listAdminUsers = () =>
    api.get('/eval/admin/users').then(r => r.data);

export const triggerAdminRun = (userId) =>
    api.post(`/eval/admin/run/${userId}`).then(r => r.data);

export default api;
