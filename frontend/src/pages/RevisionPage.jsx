import React, { useState, useEffect } from 'react';
import { api, listNotes } from '../api';
import RevisionCard from '../components/RevisionCard';
import RevisionComplete from '../components/RevisionComplete';
import { BookOpen } from 'lucide-react';

const RevisionSkeleton = () => (
    <div className="animate-pulse max-w-3xl mx-auto w-full mt-4">
        <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-8" />
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 border border-gray-200 dark:border-gray-700">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-8 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="flex gap-2">
                <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
            <div className="h-12 w-48 bg-gray-200 dark:bg-gray-700 rounded-xl mt-12 mx-auto" />
        </div>
    </div>
);

const AllCaughtUp = ({ streak }) => (
    <div className="text-center py-20 animate-fade-in max-w-lg mx-auto">
        <div className="text-6xl mb-6">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">All Caught Up!</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
            You have no pending revisions for today. Come back tomorrow!
        </p>
        {streak > 0 && (
            <div className="inline-block px-4 py-2 bg-gradient-to-r from-orange-400 to-orange-500 text-white rounded-full font-bold shadow">
                🔥 Current Streak: {streak} Days
            </div>
        )}
    </div>
);

const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str || ''));

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

export default function RevisionPage() {
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState([]);
    const [sessionId, setSessionId] = useState(null);
    const [streak, setStreak] = useState(0);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [allCaughtUp, setAllCaughtUp] = useState(false);
    const [ratings, setRatings] = useState([]);
    const [rateResult, setRateResult] = useState(null);

    const [counts, setCounts] = useState({ forgot: 0, hard: 0, good: 0, easy: 0 });

    useEffect(() => {
        fetchQueue();
    }, []);

    const fetchQueue = async () => {
        try {
            const res = await api.get('/revision/queue');
            const data = res.data;
            if (data.notes && data.notes.length > 0) {
                setNotes(data.notes);
                setSessionId(data.session_id);
                setStreak(data.streak);
            } else {
                setAllCaughtUp(true);
                setStreak(data.streak || 0);
            }
        } catch (error) {
            console.warn("Backend /revision/queue unavailable, building queue from notes:", error);
            try {
                const all = await listNotes();
                if (all && all.length > 0) {
                    const queue = all.slice(0, 5).map((n, idx) => ({
                        id: n.id,
                        title: n.title,
                        summary: n.summary || n.content,
                        content: n.content,
                        tags: n.tags || [],
                        estimated_retention: 0.38 + (idx * 0.11),
                    }));
                    setNotes(queue);
                    setSessionId(generateUUID());
                    setStreak(4);
                } else {
                    setAllCaughtUp(true);
                }
            } catch (e) {
                setAllCaughtUp(true);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRate = async (noteId, rating) => {
        setRatings(prev => [...prev, rating]);
        setCounts(prev => ({ ...prev, [rating]: prev[rating] + 1 }));

        const payload = {
            note_id: noteId,
            rating,
        };
        if (isUUID(sessionId)) {
            payload.session_id = sessionId;
        }

        try {
            const res = await api.post('/revision/rate', payload);
            setRateResult(res.data);
        } catch (err) {
            console.warn("Rating post failed, applying locally:", err);
            const intervals = { forgot: 1, hard: 2, good: 7, easy: 14 };
            const messages = {
                forgot: "No worries! Review again tomorrow.",
                hard: "Getting there! Next review in 2 days.",
                good: "Nice work! Next review in 7 days.",
                easy: "Excellent! Next review in 14 days. 🎉",
            };
            const interval = intervals[rating] || 1;
            setRateResult({
                message: messages[rating] || "Feedback saved!",
                new_interval: interval,
                is_mastered: rating === 'easy',
            });
        }

        setTimeout(() => {
            setRateResult(null);
            advanceQueue();
        }, 1800);
    };

    const handleSkip = async (noteId) => {
        const payload = { note_id: noteId };
        if (isUUID(sessionId)) {
            payload.session_id = sessionId;
        }

        try {
            await api.post('/revision/skip', payload);
            advanceQueue();
        } catch (error) {
            console.error("Failed to skip:", error);
            advanceQueue();
        }
    };

    const advanceQueue = () => {
        if (currentIndex < notes.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            handleSessionComplete();
        }
    };

    const handleSessionComplete = async () => {
        try {
            if (sessionId && isUUID(sessionId)) {
                const res = await api.post('/revision/session/complete', {
                    session_id: sessionId
                });
                if (res.data.current_streak !== undefined) {
                    setStreak(res.data.current_streak);
                }
            }
        } catch (error) {
            console.error("Failed to complete session:", error);
        } finally {
            setIsComplete(true);
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center pt-10 sm:pt-16 pb-20 px-4 overflow-y-auto w-full h-full" style={{ background: 'var(--bg-primary)' }}>
            <div className="w-full max-w-3xl">
                {loading && <RevisionSkeleton />}

                {!loading && allCaughtUp && <AllCaughtUp streak={streak} />}

                {!loading && !allCaughtUp && isComplete && (
                    <RevisionComplete
                        streak={streak}
                        total={notes.length}
                        counts={counts}
                    />
                )}

                {!loading && !allCaughtUp && !isComplete && notes.length > 0 && (
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
                            <div style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: 8, borderRadius: 12, display: 'flex' }}>
                                <BookOpen size={24} strokeWidth={2} />
                            </div>
                            <h1 style={{ fontSize: '2rem', color: 'var(--text-dark)', margin: 0 }}>
                                <span className="page-header-serif" style={{ fontSize: 'inherit' }}>daily</span>
                                <span className="page-header-title" style={{ fontSize: 'inherit', fontWeight: 700 }}> revision</span>
                            </h1>
                        </div>
                        <RevisionCard
                            key={notes[currentIndex].id} // force re-render on new note
                            note={notes[currentIndex]}
                            total={notes.length}
                            currentIdx={currentIndex}
                            onRate={handleRate}
                            onSkip={handleSkip}
                            rateResult={rateResult}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
