# ==========================================================================
# update_model.ps1 — 将 trade_model.json 的最新权重写入 script.js
# 使用方法: 双击 update_model.bat，或 PowerShell 直接运行本脚本
# ==========================================================================

$ErrorActionPreference = 'Stop'

$root       = $PSScriptRoot
$scriptPath = Join-Path $root 'script.js'
$jsonPath   = Join-Path $root 'trade_model.json'

# ── 0. 检查文件 ─────────────────────────────────────────────────────────────
if (-not (Test-Path $jsonPath))   { Write-Error "找不到 trade_model.json"; exit 1 }
if (-not (Test-Path $scriptPath)) { Write-Error "找不到 script.js";        exit 1 }

# ── 1. 解析 JSON ─────────────────────────────────────────────────────────────
$json = Get-Content $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

$exportedAt       = $json.exportedAt
$version          = [int]$json.version
$totalSamples     = [int]$json.totalSamples
$generation       = [int]$json.generation
$maDiffMult       = [double]$json.maDiffMult
$intraDayPosMult  = if ($null -ne $json.intraDayPosMult)  { [double]$json.intraDayPosMult  } else { 0.0 }
$openStrengthMult = if ($null -ne $json.openStrengthMult) { [double]$json.openStrengthMult } else { 0.0 }
$todMult          = if ($null -ne $json.todMult)          { [double]$json.todMult          } else { 0.0 }

# 数字格式辅助：保留有效小数，不出现科学计数法
function Fmt([double]$v, [int]$dec = 4) {
    $s = $v.ToString("F$dec").TrimEnd('0').TrimEnd('.')
    # 整数加 .0 以区分 JS int
    if ($s -notmatch '\.') { $s = $s + '.0' }
    return $s
}

# ── 2. 构建 buckets 行 ───────────────────────────────────────────────────────
$bucketLines = foreach ($b in $json.buckets) {
    $id    = $b.id
    $label = $b.label
    $minR  = [int]$b.minRsi
    $base  = Fmt ([double]$b.base)
    $cnt   = [int]$b.count
    $cc    = [int]$b.correctCount
    "            { id: '$id', label: '$label', minRsi: $minR, base: $($base.PadLeft(8)),   count: $cnt, correctCount: $cc },"
}
$bucketsBlock = $bucketLines -join "`n"

# ── 3. 构建新的 HARDCODED_WEIGHTS 区块 ───────────────────────────────────────
$newBlock = @"
    // [WEIGHTS:START] ── 每日由 update_model.bat 自动更新，勿手动编辑此区块 ──
    static HARDCODED_WEIGHTS = {
        exportedAt:       '$exportedAt',
        version:           $version,
        totalSamples:      $totalSamples,
        generation:        $generation,
        maDiffMult:       $(Fmt $maDiffMult),
        intraDayPosMult:   $(Fmt $intraDayPosMult),   // intraday stochastic [-1,+1] learnable weight
        openStrengthMult:  $(Fmt $openStrengthMult),   // (current-open)/open*100 learnable weight
        todMult:           $(Fmt $todMult),   // time-of-day seasonality learnable weight
        buckets: [
$bucketsBlock
        ],
    };
    // [WEIGHTS:END]
"@

# ── 4. 读取 script.js 并用 Regex 替换标记之间的内容 ─────────────────────────
$content = Get-Content $scriptPath -Raw -Encoding UTF8

$pattern     = '(?s)    // \[WEIGHTS:START\].*?// \[WEIGHTS:END\]'
$replacement = $newBlock.TrimStart("`r`n")   # 避免多余首行空行

if ($content -notmatch $pattern) {
    Write-Error "script.js 中找不到 [WEIGHTS:START]...[WEIGHTS:END] 标记，请检查文件"
    exit 1
}

$updated = [System.Text.RegularExpressions.Regex]::Replace($content, $pattern, $replacement)

# ── 5. 写回（保留 UTF-8 无 BOM） ─────────────────────────────────────────────
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($scriptPath, $updated, $utf8NoBom)

Write-Host ""
Write-Host "  ✅ script.js 已更新！" -ForegroundColor Green
Write-Host "     generation   : $generation" -ForegroundColor Cyan
Write-Host "     totalSamples : $totalSamples" -ForegroundColor Cyan
Write-Host "     maDiffMult   : $maDiffMult" -ForegroundColor Cyan
Write-Host "     exportedAt   : $exportedAt" -ForegroundColor Cyan
Write-Host ""
