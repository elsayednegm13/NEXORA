# NEXORA Phase 6.1.2 — Admin Light Theme Hotfix

## السبب
في Light Mode كان الـDashboard يبدّل متغيرات النص والخلفيات العامة إلى Light، لكن الـSidebar بقي بخلفية Dark ثابتة (`rgba(4,15,24,.92)`). النتيجة: نصوص داكنة فوق Sidebar داكنة، وبالتالي ضعف واضح في القراءة وعدم اتساق الثيم.

## ما تم إصلاحه
- Sidebar كاملة أصبحت Light عند اختيار Light Mode.
- Contrast صحيح للـBrand وNavigation وActive Item.
- Hover/Active states متوافقة مع Light Mode.
- Topbar shadow أخف.
- Inputs / tables / drawer backdrop / switches / toast متوافقة مع Light.
- Auth visual أصبح Light عند وجود Light preference.
- Dark Mode لم يتم تغييره.
- لا يوجد أي تعديل على D1 أو Worker API أو Secrets أو بيانات Admin.

## التطبيق
1. فك محتويات هذا الـZIP فوق نفس فولدر مشروع Phase 6.1.1 عندك ووافق على Replace.
2. افتح PowerShell في Root المشروع.
3. نفذ:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\APPLY_6_1_2_LIGHT_THEME.ps1
```

4. افتح لوحة الإدارة، اختر Light Mode، ثم `Ctrl+F5` مرة واحدة لتجاوز Cache المتصفح.
