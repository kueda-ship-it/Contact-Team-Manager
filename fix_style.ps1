$path = "c:\Users\000367\OneDrive - 株式会社フルタイムシステム\html\Teams-api\style.css"
$lines = Get-Content $path -TotalCount 1658
$lines | Set-Content $path -Encoding utf8
$append = @"
/* Settings Icon Enhancement */
.btn-outline[title="チーム設定"],
.btn-outline[title="設定"],
#admin-btn {
    color: #4bf2ad !important;
    opacity: 0.85;
}

.btn-outline[title="チーム設定"]:hover,
.btn-outline[title="設定"]:hover,
#admin-btn:hover {
    opacity: 1;
    background: rgba(75, 242, 173, 0.1);
    transform: rotate(30deg);
}
"@
Add-Content $path $append -Encoding utf8
Write-Host "Fixed style.css"
