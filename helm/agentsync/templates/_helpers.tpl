{{/*
Expand the name of the chart.
*/}}
{{- define "agentsync.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "agentsync.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "agentsync.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "agentsync.labels" -}}
helm.sh/chart: {{ include "agentsync.chart" . }}
{{ include "agentsync.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "agentsync.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agentsync.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "agentsync.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "agentsync.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Web component labels
*/}}
{{- define "agentsync.web.labels" -}}
{{ include "agentsync.labels" . }}
app.kubernetes.io/component: web
{{- end }}

{{/*
Web selector labels
*/}}
{{- define "agentsync.web.selectorLabels" -}}
{{ include "agentsync.selectorLabels" . }}
app.kubernetes.io/component: web
{{- end }}

{{/*
Worker component labels
*/}}
{{- define "agentsync.worker.labels" -}}
{{ include "agentsync.labels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Worker selector labels
*/}}
{{- define "agentsync.worker.selectorLabels" -}}
{{ include "agentsync.selectorLabels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Redis URL
*/}}
{{- define "agentsync.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- if .Values.redis.auth.enabled }}
redis://:{{ .Values.redis.auth.password }}@{{ include "agentsync.fullname" . }}-redis-master:6379
{{- else }}
redis://{{ include "agentsync.fullname" . }}-redis-master:6379
{{- end }}
{{- else }}
{{- if .Values.externalRedis.password }}
redis://:{{ .Values.externalRedis.password }}@{{ .Values.externalRedis.host }}:{{ .Values.externalRedis.port }}
{{- else }}
redis://{{ .Values.externalRedis.host }}:{{ .Values.externalRedis.port }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Image tag
*/}}
{{- define "agentsync.imageTag" -}}
{{- default .Chart.AppVersion .Values.web.image.tag }}
{{- end }}
