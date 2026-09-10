-- NEXORA Technologies — verified public seed data only.
-- Optional content stays empty until real data exists.
INSERT OR IGNORE INTO services(id,slug,title_ar,title_en,short_description_ar,short_description_en,description_ar,description_en,icon_key,is_active,is_featured,sort_order)
VALUES
(1,'websites','مواقع ويب','Websites','مواقع احترافية ومتجاوبة تمثل العلامة بوضوح وتدعم أهداف النمو.','Professional responsive websites that represent the brand clearly and support growth goals.',NULL,NULL,'web',1,1,1),
(2,'web-platforms','منصات ويب','Web Platforms','بوابات ومنصات رقمية مخصصة للمستخدمين والعمليات والنمو.','Custom portals and digital platforms for users, workflows and growth.',NULL,NULL,'platform',1,1,2),
(3,'erp-crm','أنظمة ERP وCRM','ERP & CRM','أنظمة أعمال لتنظيم العمليات والعملاء والمخزون والتقارير.','Business systems for operations, customers, inventory and reporting.',NULL,NULL,'system',1,1,3),
(4,'ui-ux-design','تصميم UI/UX','UI/UX Design','واجهات وأنظمة تصميم واضحة تركز على سهولة الاستخدام والثقة.','Clear interfaces and design systems focused on usability and trust.',NULL,NULL,'design',1,1,4),
(5,'custom-systems','أنظمة مخصصة','Custom Systems','حلول برمجية مصممة حول متطلبات ومسارات عمل فريدة.','Tailored software built around unique requirements and workflows.',NULL,NULL,'custom',1,1,5);

INSERT OR IGNORE INTO media_assets(id,storage_disk,url,original_name,mime_type) VALUES
(101,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-1.png','project-1.png','image/png'),
(102,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-2.png','project-2.png','image/png'),
(103,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-3.png','project-3.png','image/png'),
(104,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-4.png','project-4.png','image/png'),
(105,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-5.png','project-5.png','image/png'),
(106,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-6.png','project-6.png','image/png'),
(107,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-7.png','project-7.png','image/png'),
(108,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-8.png','project-8.png','image/png'),
(109,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-9.png','project-9.png','image/png'),
(110,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-10.png','project-10.png','image/png'),
(111,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-11.png','project-11.png','image/png'),
(112,'remote','https://raw.githubusercontent.com/ziad223/ziaad-portfolio/refs/heads/master/images/project-12.png','project-12.png','image/png');

INSERT OR IGNORE INTO projects(id,slug,title_ar,title_en,website_url,domain,status,cover_media_id,is_featured,is_active,sort_order,published_at) VALUES
(1,'nineveh-platform','منصة نينوي','Nineveh Platform','https://ninevehautogo.com/ar','ninevehautogo.com','live',101,1,1,1,CURRENT_TIMESTAMP),
(2,'7ajatna-store','متجر حاجاتنا','7ajatna Store','https://7ajatna.com/ar','7ajatna.com','live',102,1,1,2,CURRENT_TIMESTAMP),
(3,'support-al-watan','منصة دعم الوطن','Support Al-Watan','https://supportad.sa/ar','supportad.sa','live',103,1,1,3,CURRENT_TIMESTAMP),
(4,'bmkc-structure','شركة بشار قطامش','BMKC Structure','https://bmkcstructure.com/','bmkcstructure.com','live',104,1,1,4,CURRENT_TIMESTAMP),
(5,'dkaa-al-najaz','دقة الإنجاز الذكي','Dkaa Al-Najaz','https://dkaalnjazaldhaki.com/','dkaalnjazaldhaki.com','live',105,0,1,5,CURRENT_TIMESTAMP),
(6,'nemo-child','موقع نمو','Nemo Child','https://nemuchild.com/ar','nemuchild.com','live',106,0,1,6,CURRENT_TIMESTAMP),
(7,'ppros','محترفو الخصوصية','PPROS','https://ppros.com.sa/','ppros.com.sa','live',107,0,1,7,CURRENT_TIMESTAMP),
(8,'kora-ticket','كورة تكت','Kora Ticket','https://koraticket.com/ar','koraticket.com','live',108,0,1,8,CURRENT_TIMESTAMP),
(9,'luxury-care','الرعاية الفاخرة','Luxury Care','https://lcm.com.sa/','lcm.com.sa','live',109,0,1,9,CURRENT_TIMESTAMP),
(10,'brand-clinic-pro','Brand Clinic Pro','Brand Clinic Pro','https://brandclinic-pro.com/','brandclinic-pro.com','live',110,0,1,10,CURRENT_TIMESTAMP),
(11,'purple-art-agency-com','وكالة الأرجواني','Purple Art Agency','https://purpleartagency.com/','purpleartagency.com','live',111,0,1,11,CURRENT_TIMESTAMP),
(12,'purple-art-agency-net','وكالة الأرجواني','Purple Art Agency','https://purpleartagency.net/','purpleartagency.net','live',112,0,1,12,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO inquiry_option_items(group_key,option_key,label_ar,label_en,is_active,sort_order) VALUES
('project_stage','idea','فكرة جديدة','New idea',1,1),
('project_stage','existing','منتج قائم','Existing product',1,2),
('project_stage','redesign','إعادة تصميم','Redesign',1,3),
('project_stage','expansion','تطوير أو إضافة جديدة','Expansion / new module',1,4),
('timeline','asap','في أقرب وقت مناسب','As soon as practical',1,1),
('timeline','1_3_months','من شهر إلى 3 شهور','1–3 months',1,2),
('timeline','3_6_months','من 3 إلى 6 شهور','3–6 months',1,3),
('timeline','flexible','مرن','Flexible',1,4),
('budget_mode','guidance','محتاج مساعدة في تحديد الميزانية','I need guidance',1,1),
('budget_mode','flexible','الميزانية مرنة','Flexible budget',1,2),
('budget_mode','defined','عندي ميزانية محددة','I have a defined budget',1,3),
('currency','EGP',NULL,NULL,1,1),
('currency','USD',NULL,NULL,1,2),
('currency','SAR',NULL,NULL,1,3),
('currency','AED',NULL,NULL,1,4),
('currency','EUR',NULL,NULL,1,5);
