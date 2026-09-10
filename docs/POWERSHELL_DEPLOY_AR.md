# رفع NEXORA على Cloudflare — PowerShell فقط

## أول مرة

فك الـZIP وافتح PowerShell داخل فولدر المشروع.

لو Node.js غير مثبت:

```powershell
winget install OpenJS.NodeJS.LTS
```

اقفل PowerShell وافتحه مرة أخرى داخل فولدر المشروع، ثم:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\FIRST_DEPLOY.ps1
```

السكريبت سيقوم تلقائيًا بـ:

1. تثبيت Wrangler محليًا داخل المشروع.
2. فتح Cloudflare Login إذا لم تكن مسجلاً.
3. إنشاء `nexora-db` وربطه باسم `DB`.
4. إنشاء الجداول وإضافة الـ5 Services والـ12 Projects والخيارات المعتمدة.
5. نشر الموقع والـWorker بنفس اسم `nexoratechnologies`.
6. إنشاء ورفع أسرار الإدارة.
7. طباعة `ADMIN_SETUP_KEY` مرة واحدة؛ احتفظ به حتى تنشئ المدير الأول.

بعد نجاحه:

```powershell
.\scripts\RUNTIME_CHECK.ps1
```

ثم افتح:

```text
https://nexoratechnologies.elsayedmohamed963.workers.dev/admin/setup.html
```

أنشئ المدير الأول باستخدام `ADMIN_SETUP_KEY` الذي ظهر في PowerShell.

## أي تحديث بعد ذلك

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\UPDATE_DEPLOY.ps1
```

لا تحذف D1 ولا تعيد إنشاء قاعدة البيانات عند تحديث التصميم أو الكود.
