!include nsDialogs.nsh
!include LogicLib.nsh
!include MUI2.nsh

!ifndef BUILD_UNINSTALLER
Var CotrimServer
Var CotrimServerInput

; Keep the payload outside the binary so Authenticode signatures remain valid.
; Download name: CotrimBot--<hex-encoded HTTPS origin>.exe
!macro customInit
  StrCpy $CotrimServer ""
  StrCpy $0 $EXEFILE 11
  ${If} $0 == "CotrimBot--"
    StrCpy $1 11
    cotrim_decode:
      StrCpy $2 $EXEFILE 2 $1
      StrCpy $3 $2 1
      ${If} $3 == "."
      ${OrIf} $3 == " "
      ${OrIf} $3 == ""
        Goto cotrim_decoded
      ${EndIf}
      IntOp $4 "0x$2" + 0
      IntFmt $5 "%02x" $4
      ${If} $5 != $2
        MessageBox MB_ICONSTOP "Nome do instalador inválido. Baixe novamente pelo site."
        Abort
      ${EndIf}
      ${If} $4 < 33
      ${OrIf} $4 > 126
        Abort
      ${EndIf}
      IntFmt $5 "%c" $4
      StrCpy $CotrimServer "$CotrimServer$5"
      IntOp $1 $1 + 2
      Goto cotrim_decode
    cotrim_decoded:
  ${EndIf}
  ${If} $CotrimServer == ""
    ReadRegStr $CotrimServer HKCU "Software\CotrimBot" "ServerUrl"
  ${EndIf}
  ${If} $CotrimServer == ""
    StrCpy $CotrimServer "https://cotrim.infordoc.net"
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom CotrimServerPage CotrimServerLeave
!macroend

Function CotrimServerPage
  !insertmacro MUI_HEADER_TEXT "Servidor do CotrimBot" "Confira o servidor que o aplicativo deve abrir."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 24u "URL do servidor (HTTPS):"
  Pop $0
  ${NSD_CreateText} 0 28u 100% 14u "$CotrimServer"
  Pop $CotrimServerInput
  nsDialogs::Show
FunctionEnd

Function CotrimServerLeave
  ${NSD_GetText} $CotrimServerInput $CotrimServer
  StrCpy $0 $CotrimServer 8
  ${If} $0 != "https://"
    MessageBox MB_ICONSTOP "Informe uma URL HTTPS válida."
    Abort
  ${EndIf}
FunctionEnd

!macro customInstall
  CreateDirectory "$INSTDIR\resources"
  ClearErrors
  FileOpen $0 "$INSTDIR\resources\server-url.txt" w
  ${If} ${Errors}
    MessageBox MB_ICONSTOP "Não foi possível salvar o servidor."
    Abort
  ${EndIf}
  FileWrite $0 "$CotrimServer"
  FileClose $0
  WriteRegStr HKCU "Software\CotrimBot" "ServerUrl" "$CotrimServer"
!macroend
!endif
