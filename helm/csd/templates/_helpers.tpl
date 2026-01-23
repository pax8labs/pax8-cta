{{/*
Expand the name of the chart.
*/}}
{{- define "csd.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "csd.fullname" -}}
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
{{- define "csd.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "csd.labels" -}}
helm.sh/chart: {{ include "csd.chart" . }}
{{ include "csd.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "csd.selectorLabels" -}}
app.kubernetes.io/name: {{ include "csd.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "csd.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "csd.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Redis URL
*/}}
{{- define "csd.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- printf "redis://:%s@%s-redis-master:6379" .Values.secrets.redisPassword (include "csd.fullname" .) }}
{{- else }}
{{- printf "redis://:%s@%s:%s" .Values.externalRedis.password .Values.externalRedis.host (toString .Values.externalRedis.port) }}
{{- end }}
{{- end }}

{{/*
Database URL
*/}}
{{- define "csd.databaseUrl" -}}
{{- if .Values.database.enabled }}
{{- printf "postgresql://%s:%s@%s:%s/%s" .Values.database.user .Values.secrets.databasePassword .Values.database.host (toString .Values.database.port) .Values.database.name }}
{{- else }}
{{- "" }}
{{- end }}
{{- end }}
