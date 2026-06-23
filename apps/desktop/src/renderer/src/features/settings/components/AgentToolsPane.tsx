import React from 'react'
import { AgentToolsView } from '@baishou/ui'
import { BaishouAgentGateSettingsSection } from './BaishouAgentGateSettingsSection'
import styles from './GeneralSettingsPane.module.css'

interface AgentToolsPaneProps {
  settings: any
}

export const AgentToolsPane: React.FC<AgentToolsPaneProps> = ({ settings }) => {
  if (!settings.toolManagementConfig) return <div />
  return (
    <div className="settings-pane settings-pane-full">
      <div className={styles.container}>
        <BaishouAgentGateSettingsSection />
        <section className={styles.cardSection}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Agent Tools</h3>
          </div>
          <div className={styles.cardBody}>
            <AgentToolsView
              config={settings.toolManagementConfig}
              onChange={(config) => settings.setToolManagementConfig(config)}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
