// src/components/SmartAssistant.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Send, Bot, Sparkles, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase'; // <-- ADDED SUPABASE IMPORT

type Message = {
  id: number;
  role: 'bot' | 'user';
  text: string;
};

// Suggested actions that users can just tap instead of typing
const QUICK_ACTIONS = [
  "Where is staff logged in?",
  "View Sales",
  "Edit Attendance",
  "New Package",
  "Package History"
];

export default function SmartAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'bot',
      text: "Hello! I am your Spa Assistant. You can ask me to find an employee, type a client's number, or tap a quick action below!",
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Auto-scroll to the bottom of the chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const processInput = async (userText: string) => { // <-- CHANGED TO ASYNC
    if (!userText.trim()) return;

    // Add user message
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: userText }]);
    setInput('');
    setIsTyping(true);

    // Artificial delay to feel like AI "thinking"
    await new Promise(resolve => setTimeout(resolve, 800));

    let botReply = "I didn't quite catch that. Try typing a 10-digit mobile number, or say 'Go to sales'!";
    let redirectUrl = '';

    const lowerInput = userText.toLowerCase();

    // 1. EXTRACT ENTITIES (Phone Numbers)
    const phoneMatch = userText.match(/\b\d{10}\b/);
    
    // 2. EXTRACT ACTIONS (Verbs)
    const isEdit = lowerInput.includes('edit') || lowerInput.includes('change') || lowerInput.includes('update') || lowerInput.includes('fix') || lowerInput.includes('mistake');
    const isNew = lowerInput.includes('new') || lowerInput.includes('add') || lowerInput.includes('create');
    const isWhere = lowerInput.includes('where is') || lowerInput.includes('where') || lowerInput.includes('logged in') || lowerInput.includes('outlet is');

    // 3. EXTRACT TARGETS (Nouns)
    const isAttendance = lowerInput.includes('attendance') || lowerInput.includes('staff') || lowerInput.includes('present') || lowerInput.includes('employee');
    const isSale = lowerInput.includes('sale') || lowerInput.includes('dashboard') || lowerInput.includes('bill');
    const isPackage = lowerInput.includes('package');
    const isExpense = lowerInput.includes('expense') || lowerInput.includes('cost') || lowerInput.includes('spend');
    const isForm = lowerInput.includes('form') || lowerInput.includes('check in') || lowerInput.includes('desk');

    // --- 4. ROUTING & LIVE DATA LOGIC ---

    // SCENARIO A: Ask about Employee Location (Live DB Query)
    if (isWhere && (isAttendance || !phoneMatch)) {
        try {
            // Fetch the last 100 attendance records to find the staff member
            const { data, error } = await supabase
                .from('attendance')
                .select('employee_name, outlet_name, date, created_at')
                .order('created_at', { ascending: false })
                .limit(100);

            if (!error && data && data.length > 0) {
                // Find all unique employees in recent logs that match the user's text
                const matchedRecords = data.filter(a => a.employee_name && lowerInput.includes(a.employee_name.toLowerCase()));
                
                if (matchedRecords.length > 0) {
                    // Grab just their single most recent record
                    const latestPerEmployee: Record<string, any> = {};
                    matchedRecords.forEach(r => {
                        if (!latestPerEmployee[r.employee_name]) latestPerEmployee[r.employee_name] = r;
                    });

                    const todayStr = new Date().toISOString().split('T')[0];
                    
                    const replies = Object.values(latestPerEmployee).map((m: any) => {
                        const recDate = m.date || (m.created_at ? m.created_at.split('T')[0] : 'recently');
                        const timeWord = (recDate === todayStr) ? 'is logged in TODAY' : `was last logged in on ${recDate}`;
                        return `📍 ${m.employee_name} ${timeWord} at ${m.outlet_name || 'an outlet'}.`;
                    });

                    botReply = replies.join('\n\n');
                } else if (lowerInput.includes('where is staff logged in') || lowerInput.includes('who is logged in')) {
                    // If they just generally ask "who is logged in?"
                    redirectUrl = `/dashboard/attendance`;
                    botReply = "Taking you to the Live Attendance page to see everyone's locations!";
                } else {
                    botReply = "I couldn't find an employee by that name in the recent logs. Let me take you to the Attendance page to check manually.";
                    redirectUrl = `/dashboard/attendance`;
                }
            } else {
                botReply = "Taking you to the Attendance page to check...";
                redirectUrl = `/dashboard/attendance`;
            }
        } catch (e) {
            botReply = "Taking you to the Attendance page...";
            redirectUrl = `/dashboard/attendance`;
        }
    }

    // SCENARIO B: Client Specific (Phone Number detected)
    else if (phoneMatch) {
      const phone = phoneMatch[0];
      if (isEdit) {
          botReply = `Opening the history for ${phone}. You can edit their visits, packages, and dates right there.`;
      } else {
          botReply = `Found it! Taking you directly to the profile for ${phone}...`;
      }
      redirectUrl = `/dashboard/customers/${phone}`;
    } 
    
    // SCENARIO C: Attendance Page
    else if (isAttendance) {
      botReply = "Taking you to the Staff Attendance page now...";
      redirectUrl = `/dashboard/attendance`;
    } 
    
    // SCENARIO D: Packages
    else if (isPackage) {
      if (isEdit || lowerInput.includes('history') || lowerInput.includes('activity')) {
          botReply = "Opening Package Activity. You can edit package redemptions and sales here.";
          redirectUrl = `/dashboard/packages/activity`;
      } else if (isNew) {
          botReply = "Let's sell a new package! Redirecting...";
          redirectUrl = `/dashboard/packages/new`;
      } else {
          botReply = "Taking you to Package History...";
          redirectUrl = `/dashboard/packages/activity`; 
      }
    } 
    
    // SCENARIO E: Sales
    else if (isSale) {
      if (isEdit) {
          botReply = "Opening the Live Sales Dashboard. Just click 'Edit' next to the specific transaction.";
      } else {
          botReply = "Taking you to the Live Sales Dashboard...";
      }
      redirectUrl = `/dashboard/sales`;
    } 
    
    // SCENARIO F: Expenses
    else if (isExpense) {
      botReply = "Opening the Expense Tracker...";
      redirectUrl = `/dashboard/expenses`;
    } 
    
    // SCENARIO G: Front Desk Form
    else if (isForm) {
      botReply = "Opening the Front Desk entry form...";
      redirectUrl = `/dashboard/form`; 
    } 
    
    // SCENARIO H: Greetings
    else if (lowerInput.includes('hi') || lowerInput.includes('hello')) {
      botReply = "Hello! Ask me 'Where is Rahul logged in?', paste a client's mobile number, or ask to go to Expenses.";
    }

    // Add Bot Reply
    setIsTyping(false);
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + 1, role: 'bot', text: botReply },
    ]);

    // Execute Redirect if triggered
    if (redirectUrl) {
      setTimeout(() => {
        router.push(redirectUrl);
        setIsOpen(false); 
      }, 1800); // 1.8s delay to allow reading
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processInput(input);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100]">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-[380px] sm:w-[420px] bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-indigo-200 flex flex-col h-[550px] transition-all duration-300 transform origin-bottom-right">
          
          {/* Header */}
          <div className="bg-indigo-700 p-4 flex justify-between items-center text-white shadow-md z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-full">
                <Sparkles size={24} className="text-yellow-300" />
              </div>
              <div>
                  <h3 className="font-bold text-lg tracking-wide">Spa Assistant</h3>
                  <p className="text-xs text-indigo-200 font-medium">I can answer questions & navigate!</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-indigo-800 p-2 rounded-full transition-colors border border-transparent hover:border-indigo-400">
              <X size={24} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-5 overflow-y-auto bg-gray-50 flex flex-col gap-5">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'bot' && (
                  <div className="w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 flex-shrink-0 mt-1">
                    <Bot size={22} />
                  </div>
                )}
                <div className={`p-4 rounded-2xl max-w-[85%] text-base shadow-sm ${
                    msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-sm font-medium' 
                    : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm font-medium leading-relaxed'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            
            {/* Typing Indicator */}
            {isTyping && (
                <div className="flex gap-3 justify-start">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 flex-shrink-0 mt-1">
                        <Bot size={22} />
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-gray-200 rounded-tl-sm flex gap-1 items-center">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {!isTyping && (
             <div className="px-3 pb-3 bg-gray-50 flex gap-2 overflow-x-auto whitespace-nowrap hide-scrollbar border-t border-gray-100 pt-3">
                {QUICK_ACTIONS.map(action => (
                    <button 
                        key={action}
                        onClick={() => processInput(action)}
                        className="px-4 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-full text-sm font-bold shadow-sm hover:bg-indigo-50 flex items-center gap-1 transition-colors flex-shrink-0"
                    >
                        {action} <ChevronRight size={14} />
                    </button>
                ))}
             </div>
          )}

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-gray-200 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask 'Where is Priya?' or type number"
              className="flex-1 bg-gray-100 text-base rounded-xl px-4 py-3 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 text-gray-900 transition-all font-medium placeholder:text-gray-500"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md flex items-center justify-center min-w-[50px]"
            >
              <Send size={24} />
            </button>
          </form>
        </div>
      )}

      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-indigo-700 hover:bg-indigo-800 text-white p-5 rounded-full shadow-2xl shadow-indigo-300 transition-all hover:scale-105 flex items-center justify-center group border-4 border-white"
          title="Open Smart Assistant"
        >
          <Sparkles size={32} className="group-hover:animate-pulse" />
        </button>
      )}
    </div>
  );
}