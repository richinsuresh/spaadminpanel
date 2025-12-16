// src/app/dev-settings/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Settings, Check, Loader2, AlertTriangle } from 'lucide-react'; 

// Configuration key must match the one used in the Poller component
const SETTINGS_KEY_TARGET_ADMIN = 'target_admin_uid'; 

// Type structure based on the data we are mapping
type UserProfile = { id: string, identifier: string, name: string | null };

// === DB CONFIGURATION ===
// 🛑 CRITICAL: Based on the provided screenshot of public.app_users 🛑

// FIX: The unique identifier is the 'username' column.
const UNIQUE_IDENTIFIER_COLUMN = 'username'; 

// FIX: The display name is also the 'username' column, as 'name' and 'full_name' do not exist.
const DISPLAY_NAME_COLUMN = 'username'; 

// ========================


export default function DevSettingsPage() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [targetAdminId, setTargetAdminId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    // 1. Fetch Users and Current Setting
    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                // Query the app_users table using the confirmed column names
                const { data: userData, error: userError } = await supabase
                    .from('app_users') 
                    .select(`id, ${DISPLAY_NAME_COLUMN}, ${UNIQUE_IDENTIFIER_COLUMN}`)
                    .order(DISPLAY_NAME_COLUMN, { ascending: true });

                // Fetch current setting
                const { data: settingData, error: settingError } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', SETTINGS_KEY_TARGET_ADMIN)
                    .single();

                if (userError) throw userError;
                // PGRST116 means "No rows found" which is fine for app_settings on first load
                if (settingError && settingError.code !== 'PGRST116') throw settingError; 

                // Map fetched data
                const mappedUsers: UserProfile[] = [];
                if (Array.isArray(userData)) {
                    userData.forEach(d => {
                        // Dynamically read identifier and name using the configured column keys
                        const identifierValue = d[UNIQUE_IDENTIFIER_COLUMN] || String(d.id);
                        const displayValue = d[DISPLAY_NAME_COLUMN] || 'Admin User';
                        
                        if (identifierValue) { 
                            mappedUsers.push({
                                id: d.id, 
                                identifier: identifierValue, // The value we store/use for comparison
                                name: displayValue,
                            });
                        }
                    });
                }
                
                setUsers(mappedUsers);
                
                if (settingData) {
                    setTargetAdminId(settingData.value);
                }

            } catch (e: any) {
                console.error("Failed to fetch dev data (Final check needed: RLS or table access):", e.message || e.details || e); 
                setStatus('error');
                
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // 2. Handle Save Action
    const handleSave = async (newTargetId: string) => {
        setStatus('saving');
        try {
            // Upsert the new target user identifier into app_settings
            const { error } = await supabase
                .from('app_settings')
                .upsert({ key: SETTINGS_KEY_TARGET_ADMIN, value: newTargetId }, { onConflict: 'key' });

            if (error) throw error;
            
            setTargetAdminId(newTargetId);
            setStatus('saved');
            setTimeout(() => setStatus('idle'), 2000);

        } catch (e: any) {
            console.error("Failed to save setting:", e.message || e.details || e);
            setStatus('error');
        }
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6 flex items-center gap-3 text-gray-800">
                <Settings /> Developer Settings
            </h1>
            <p className="mb-8 text-gray-600">
                Select the authorized dashboard user who will receive real-time, sound-based checkout/addon reminders.
            </p>

            <div className="bg-white p-6 rounded-xl shadow-lg border">
                <h2 className="text-xl font-semibold mb-4 text-indigo-700">Target Notification Admin</h2>
                
                {users.map((user) => {
                    const identifierToCompare = user.identifier; 
                    const isSelected = identifierToCompare === targetAdminId; 
                    const statusText = isSelected ? 'Active Target' : 'Set as Target';
                    const buttonClass = isSelected 
                        ? 'bg-green-100 text-green-800 pointer-events-none'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700';

                    return (
                        <div 
                            key={user.id} 
                            className="flex items-center justify-between p-3 mb-3 border rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <User className="w-5 h-5 text-gray-500" />
                                <div>
                                    <div className="font-medium text-gray-800">{user.name || 'N/A'}</div>
                                    {/* Display the identifier being saved */}
                                    <div className="text-sm text-gray-500">Identifier: {user.identifier}</div> 
                                </div>
                            </div>

                            <button
                                onClick={() => handleSave(identifierToCompare)} // Saving the unique identifier
                                disabled={status === 'saving' || isSelected}
                                className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${buttonClass}`}
                            >
                                {status === 'saving' && identifierToCompare === targetAdminId ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : isSelected ? (
                                    <Check className="w-4 h-4" />
                                ) : null}
                                {statusText}
                            </button>
                        </div>
                    );
                })}
                {users.length === 0 && !loading && (
                    <p className="text-gray-500">No authorized users found. Check the table name 'app_users' or RLS permissions.</p>
                )}
            </div>
            
            {(status === 'saved' || status === 'error') && (
                 <p className={`mt-4 text-sm p-3 rounded-lg flex items-center gap-2 ${status === 'saved' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                    {status === 'saved' ? (
                         <> <Check className="w-4 h-4" /> Setting saved successfully!</>
                    ) : (
                         <> <AlertTriangle className="w-4 h-4" /> Error: Could not save settings (Check console for RLS/DB errors).</>
                    )}
                </p>
            )}
        </div>
    );
}