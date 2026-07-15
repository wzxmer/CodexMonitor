!define CM_UNINSTALL_ROOT "Software\Microsoft\Windows\CurrentVersion\Uninstall"
!define CM_MSI_DISPLAY_NAME "Codex Monitor"
!define CM_MSI_BLOCK_MESSAGE "A Windows Installer (MSI) registration for Codex Monitor already exists. NSIS installation is blocked to protect existing files. Continue updates with the .msi package or repair installer ownership first."

!macro CM_SCAN_MSI_REGISTRATION ROOT VIEW LABEL_PREFIX
  SetRegView ${VIEW}
  StrCpy $R0 0

  ${LABEL_PREFIX}_loop:
    ClearErrors
    EnumRegKey $R1 ${ROOT} "${CM_UNINSTALL_ROOT}" $R0
    IfErrors ${LABEL_PREFIX}_done
    StrCmp $R1 "" ${LABEL_PREFIX}_done

    ReadRegStr $R2 ${ROOT} "${CM_UNINSTALL_ROOT}\$R1" "DisplayName"
    StrCmp $R2 "${CM_MSI_DISPLAY_NAME}" 0 ${LABEL_PREFIX}_next

    ClearErrors
    ReadRegDWORD $R3 ${ROOT} "${CM_UNINSTALL_ROOT}\$R1" "WindowsInstaller"
    IfErrors ${LABEL_PREFIX}_next
    IntCmp $R3 1 ${LABEL_PREFIX}_blocked ${LABEL_PREFIX}_next ${LABEL_PREFIX}_next

  ${LABEL_PREFIX}_next:
    IntOp $R0 $R0 + 1
    Goto ${LABEL_PREFIX}_loop

  ${LABEL_PREFIX}_blocked:
    SetRegView default
    IfSilent ${LABEL_PREFIX}_quit 0
    MessageBox MB_OK|MB_ICONSTOP "${CM_MSI_BLOCK_MESSAGE}"
  ${LABEL_PREFIX}_quit:
    SetErrorLevel 2
    Quit

  ${LABEL_PREFIX}_done:
!macroend

!macro CM_BLOCK_IF_MSI_REGISTERED
  Push $R0
  Push $R1
  Push $R2
  Push $R3

  !insertmacro CM_SCAN_MSI_REGISTRATION HKLM 64 cm_hklm_64
  !insertmacro CM_SCAN_MSI_REGISTRATION HKLM 32 cm_hklm_32
  !insertmacro CM_SCAN_MSI_REGISTRATION HKCU 64 cm_hkcu_64
  !insertmacro CM_SCAN_MSI_REGISTRATION HKCU 32 cm_hkcu_32

  SetRegView default
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

; Tauri's reinstall page runs before NSIS_HOOK_PREINSTALL and can otherwise
; invoke an MSI uninstaller. GUI/passive installs must stop before that page.
!define MUI_CUSTOMFUNCTION_GUIINIT CMBlockMsiBeforePages
Function CMBlockMsiBeforePages
  !insertmacro CM_BLOCK_IF_MSI_REGISTERED
FunctionEnd

; Silent installs skip GUI pages. Keep the supported Tauri hook as a second
; gate immediately before the installer writes files or registry values.
!macro NSIS_HOOK_PREINSTALL
  !insertmacro CM_BLOCK_IF_MSI_REGISTERED
!macroend
