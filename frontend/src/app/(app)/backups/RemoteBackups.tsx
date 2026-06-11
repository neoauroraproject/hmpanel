"use client";

import { useState } from "react";
import { useLicense } from "@/hooks/useLicense";
import { Cloud, Lock } from "lucide-react";
import { Card } from "@/components/ui";

export function RemoteBackups({ settings }: any) {
  const { hasFeature } = useLicense();
  const [target, setTarget] = useState('s3');
  
  if (!hasFeature('REMOTE_BACKUPS')) {
    return (
      <div className="flex flex-col items-center justify-center h-[40vh] text-zinc-500">
        <Cloud size={48} className="mb-4 opacity-50 text-purple-500" />
        <h2 className="text-xl font-semibold mb-2 text-zinc-800 dark:text-zinc-200">Premium Feature</h2>
        <p>Remote Cloud Backups (S3, Google Drive, SFTP) require a Premium License.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2 mb-6">
          <Cloud className="text-blue-500" /> Cloud Storage Providers
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div onClick={() => setTarget('s3')} className={`cursor-pointer border rounded-xl p-4 transition-all ${target === 's3' ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-200 dark:border-zinc-800 hover:border-blue-500/50'}`}>
            <div className="font-semibold text-zinc-800 dark:text-zinc-100">Amazon S3 / R2</div>
            <div className="text-xs text-zinc-500 mt-1">S3 Compatible Storage</div>
          </div>
          <div onClick={() => setTarget('gdrive')} className={`cursor-pointer border rounded-xl p-4 transition-all ${target === 'gdrive' ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-200 dark:border-zinc-800 hover:border-blue-500/50'}`}>
            <div className="font-semibold text-zinc-800 dark:text-zinc-100">Google Drive</div>
            <div className="text-xs text-zinc-500 mt-1">OAuth2 Integration</div>
          </div>
          <div onClick={() => setTarget('sftp')} className={`cursor-pointer border rounded-xl p-4 transition-all ${target === 'sftp' ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-200 dark:border-zinc-800 hover:border-blue-500/50'}`}>
            <div className="font-semibold text-zinc-800 dark:text-zinc-100">SFTP Server</div>
            <div className="text-xs text-zinc-500 mt-1">Secure File Transfer</div>
          </div>
        </div>

        {target === 's3' && (
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Endpoint URL</label>
              <input placeholder="https://s3.region.amazonaws.com" className="w-full mt-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100" />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Bucket Name</label>
              <input placeholder="my-panel-backups" className="w-full mt-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Access Key</label>
                <input type="password" placeholder="••••••••••••" className="w-full mt-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100" />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Secret Key</label>
                <input type="password" placeholder="••••••••••••" className="w-full mt-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100" />
              </div>
            </div>
            <button className="mt-4 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500">Save S3 Configuration</button>
          </div>
        )}
        
        {target === 'gdrive' && (
          <div className="space-y-4 max-w-lg">
             <p className="text-sm text-zinc-500">Authenticate with Google to allow the panel to automatically upload backups to a dedicated folder in your Google Drive.</p>
             <button className="rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-2 font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 shadow-sm flex items-center gap-2 transition-colors">
               <Lock size={16} /> Sign in with Google
             </button>
          </div>
        )}
        
        {target === 'sftp' && (
          <div className="space-y-4 max-w-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Hostname</label>
                <input placeholder="backup.example.com" className="w-full mt-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100" />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Port</label>
                <input placeholder="22" defaultValue="22" className="w-full mt-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Username</label>
                <input placeholder="admin" className="w-full mt-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100" />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Password / Key</label>
                <input type="password" placeholder="••••••••••••" className="w-full mt-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100" />
              </div>
            </div>
            <button className="mt-4 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500">Save SFTP Configuration</button>
          </div>
        )}
      </Card>
    </div>
  );
}
