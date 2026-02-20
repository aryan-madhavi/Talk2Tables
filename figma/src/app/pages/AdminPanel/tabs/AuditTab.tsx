import React from 'react';
import { ComingSoon } from '../../../routes';

/**
 * AuditTab — placeholder until the audit log feature is implemented.
 *
 * When ready, uncomment the full implementation below and remove <ComingSoon />.
 * Expected data shape: AuditLogEntry[] from ../../../types (project-level types.ts)
 */
export function AuditTab() {
  return <ComingSoon />;

  /*
  return (
    <div className="p-6 animate-in fade-in">
      <h3 className="text-lg font-bold text-gray-900 mb-6">System Audit Log</h3>
      <div className="space-y-4">
        {auditLogs.map((log) => (
          <div
            key={log.id}
            className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 border border-gray-100 hover:shadow-sm transition-shadow"
          >
            <div className={cn(
              'mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border',
              log.severity === 'info'     ? 'bg-blue-50  border-blue-100  text-blue-600'  :
              log.severity === 'warning'  ? 'bg-amber-50 border-amber-100 text-amber-600' :
                                            'bg-red-50   border-red-100   text-red-600',
            )}>
              {log.severity === 'info'
                ? <CheckCircle   className="w-4 h-4" />
                : log.severity === 'warning'
                  ? <AlertTriangle className="w-4 h-4" />
                  : <XCircle       className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-bold text-gray-900 text-sm">{log.action}</h4>
                <span className="text-xs text-gray-500 font-mono">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-gray-600">{log.details}</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                <span className="font-medium text-gray-500">{log.user}</span>
                <span>•</span>
                <span className="uppercase tracking-wider">{log.severity}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  */
}