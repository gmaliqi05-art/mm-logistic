/*
  # Mbushje e boshllëqeve të kodeve postare për Evropën

  1. Ndryshime
    - Shton kod postar të paktën një për çdo qytet që nuk ka ende
    - Mbulon DE, AT, CH, FR, IT, ES, NL, BE, GB, PL, CZ, SK, HU, RO,
      GR, SE, NO, FI, DK, EE, LV, LT, UA, TR, PT dhe Russia
    - Lejon auto-popullim të kodit postar kur përdoruesi zgjedh qytetin

  2. Siguria
    - Pa ndryshime politikash

  3. Shënime
    - Idempotent; pa konflikte sepse indeksi unik është (city_id, code)
*/

INSERT INTO postal_codes (city_id, code, area_name)
SELECT ci.id, v.code, v.area_name
FROM (VALUES
  -- Germany: additional major cities
  ('DE','Dortmund','44135','Mitte'),('DE','Essen','45127','Stadtmitte'),
  ('DE','Leipzig','04109','Zentrum'),('DE','Bremen','28195','Mitte'),
  ('DE','Dresden','01067','Altstadt'),('DE','Hannover','30159','Mitte'),
  ('DE','Nürnberg','90402','Mitte'),('DE','Duisburg','47051','Mitte'),
  ('DE','Bochum','44787','Mitte'),('DE','Wuppertal','42103','Elberfeld'),
  ('DE','Bielefeld','33602','Mitte'),('DE','Bonn','53111','Zentrum'),
  ('DE','Münster','48143','Mitte'),('DE','Karlsruhe','76133','Innenstadt'),
  ('DE','Mannheim','68159','Innenstadt'),('DE','Augsburg','86150','Innenstadt'),
  ('DE','Wiesbaden','65183','Mitte'),('DE','Gelsenkirchen','45879','Altstadt'),
  ('DE','Mönchengladbach','41061','Mitte'),('DE','Braunschweig','38100','Innenstadt'),
  ('DE','Chemnitz','09111','Zentrum'),('DE','Kiel','24103','Mitte'),
  ('DE','Aachen','52062','Mitte'),('DE','Halle','06108','Mitte'),
  ('DE','Magdeburg','39104','Altstadt'),('DE','Freiburg','79098','Altstadt'),
  ('DE','Krefeld','47798','Mitte'),('DE','Lübeck','23552','Innenstadt'),
  ('DE','Oberhausen','46045','Mitte'),('DE','Erfurt','99084','Mitte'),
  ('DE','Mainz','55116','Altstadt'),('DE','Rostock','18055','Mitte'),
  ('DE','Kassel','34117','Mitte'),('DE','Hagen','58095','Mitte'),
  ('DE','Saarbrücken','66111','Mitte'),('DE','Potsdam','14467','Mitte'),
  ('DE','Heidelberg','69115','Altstadt'),('DE','Regensburg','93047','Altstadt'),
  ('DE','Ingolstadt','85049','Mitte'),('DE','Würzburg','97070','Altstadt'),
  ('DE','Fürth','90762','Mitte'),('DE','Ulm','89073','Mitte'),
  ('DE','Heilbronn','74072','Mitte'),('DE','Pforzheim','75172','Mitte'),
  ('DE','Göttingen','37073','Mitte'),('DE','Bottrop','46236','Mitte'),
  ('DE','Trier','54290','Mitte'),('DE','Recklinghausen','45657','Mitte'),
  ('DE','Reutlingen','72764','Mitte'),('DE','Bremerhaven','27568','Mitte'),
  ('DE','Koblenz','56068','Mitte'),('DE','Jena','07743','Mitte'),
  ('DE','Remscheid','42853','Mitte'),('DE','Erlangen','91052','Mitte'),
  ('DE','Moers','47441','Mitte'),('DE','Siegen','57072','Mitte'),
  ('DE','Hildesheim','31134','Mitte'),('DE','Salzgitter','38226','Lebenstedt'),
  ('DE','Offenbach','63065','Mitte'),('DE','Cottbus','03046','Mitte'),
  ('DE','Paderborn','33098','Mitte'),('DE','Gladbeck','45964','Mitte'),
  ('DE','Osnabrück','49074','Mitte'),('DE','Solingen','42651','Mitte'),
  ('DE','Ludwigshafen','67059','Mitte'),('DE','Oldenburg','26122','Mitte'),

  -- Austria
  ('AT','Villach','9500','Innere Stadt'),('AT','Wels','4600','Zentrum'),
  ('AT','Sankt Pölten','3100','Zentrum'),('AT','Dornbirn','6850','Zentrum'),
  ('AT','Wiener Neustadt','2700','Zentrum'),('AT','Steyr','4400','Zentrum'),
  ('AT','Feldkirch','6800','Zentrum'),('AT','Bregenz','6900','Zentrum'),
  ('AT','Leonding','4060','Zentrum'),('AT','Klosterneuburg','3400','Zentrum'),
  ('AT','Baden','2500','Zentrum'),('AT','Wolfsberg','9400','Zentrum'),
  ('AT','Leoben','8700','Zentrum'),('AT','Krems','3500','Zentrum'),
  ('AT','Traun','4050','Zentrum'),('AT','Amstetten','3300','Zentrum'),
  ('AT','Kapfenberg','8605','Zentrum'),('AT','Lustenau','6890','Zentrum'),
  ('AT','Mödling','2340','Zentrum'),

  -- Switzerland
  ('CH','Winterthur','8400','Altstadt'),('CH','Lucerne','6000','Innerstadt'),
  ('CH','St. Gallen','9000','Zentrum'),('CH','Lugano','6900','Centro'),
  ('CH','Biel/Bienne','2500','Zentrum'),('CH','Thun','3600','Innenstadt'),
  ('CH','Schaffhausen','8200','Altstadt'),('CH','Fribourg','1700','Centre'),
  ('CH','Chur','7000','Altstadt'),('CH','Neuchâtel','2000','Centre'),
  ('CH','Sion','1950','Centre'),('CH','La Chaux-de-Fonds','2300','Centre'),
  ('CH','Uster','8610','Zentrum'),('CH','Zug','6300','Altstadt'),
  ('CH','Locarno','6600','Centro'),('CH','Bellinzona','6500','Centro'),
  ('CH','Rapperswil-Jona','8640','Zentrum'),('CH','Montreux','1820','Centre'),
  ('CH','Aarau','5000','Zentrum'),

  -- France
  ('FR','Strasbourg','67000','Centre'),('FR','Nantes','44000','Centre'),
  ('FR','Montpellier','34000','Centre'),('FR','Lille','59000','Centre'),
  ('FR','Rennes','35000','Centre'),('FR','Reims','51100','Centre'),
  ('FR','Le Havre','76600','Centre'),('FR','Saint-Étienne','42000','Centre'),
  ('FR','Toulon','83000','Centre'),('FR','Grenoble','38000','Centre'),
  ('FR','Dijon','21000','Centre'),('FR','Angers','49000','Centre'),
  ('FR','Nîmes','30000','Centre'),('FR','Villeurbanne','69100','Centre'),
  ('FR','Clermont-Ferrand','63000','Centre'),('FR','Le Mans','72000','Centre'),
  ('FR','Aix-en-Provence','13100','Centre'),('FR','Brest','29200','Centre'),
  ('FR','Tours','37000','Centre'),('FR','Amiens','80000','Centre'),
  ('FR','Limoges','87000','Centre'),('FR','Annecy','74000','Centre'),
  ('FR','Perpignan','66000','Centre'),('FR','Besançon','25000','Centre'),
  ('FR','Orléans','45000','Centre'),('FR','Metz','57000','Centre'),
  ('FR','Rouen','76000','Centre'),('FR','Mulhouse','68100','Centre'),
  ('FR','Caen','14000','Centre'),('FR','Nancy','54000','Centre'),
  ('FR','Tourcoing','59200','Centre'),('FR','Roubaix','59100','Centre'),
  ('FR','Pau','64000','Centre'),('FR','Avignon','84000','Centre'),
  ('FR','La Rochelle','17000','Centre'),('FR','Calais','62100','Centre'),
  ('FR','Cannes','06400','Centre'),('FR','Ajaccio','20000','Centre'),
  ('FR','Bastia','20200','Centre'),

  -- Italy
  ('IT','Bologna','40100','Centro'),('IT','Florence','50100','Centro'),
  ('IT','Bari','70100','Centro'),('IT','Catania','95100','Centro'),
  ('IT','Venice','30100','Centro'),('IT','Verona','37100','Centro'),
  ('IT','Messina','98100','Centro'),('IT','Padova','35100','Centro'),
  ('IT','Trieste','34100','Centro'),('IT','Taranto','74100','Centro'),
  ('IT','Brescia','25100','Centro'),('IT','Reggio Calabria','89100','Centro'),
  ('IT','Modena','41100','Centro'),('IT','Prato','59100','Centro'),
  ('IT','Parma','43100','Centro'),('IT','Cagliari','09100','Centro'),
  ('IT','Livorno','57100','Centro'),('IT','Foggia','71100','Centro'),
  ('IT','Reggio Emilia','42100','Centro'),('IT','Ravenna','48100','Centro'),
  ('IT','Rimini','47900','Centro'),('IT','Salerno','84100','Centro'),
  ('IT','Ferrara','44100','Centro'),('IT','Sassari','07100','Centro'),
  ('IT','Monza','20900','Centro'),('IT','Bergamo','24100','Centro'),
  ('IT','Siracusa','96100','Centro'),('IT','Pescara','65100','Centro'),
  ('IT','Latina','04100','Centro'),('IT','Vicenza','36100','Centro'),
  ('IT','Terni','05100','Centro'),('IT','Novara','28100','Centro'),
  ('IT','Ancona','60100','Centro'),('IT','Udine','33100','Centro'),
  ('IT','Arezzo','52100','Centro'),('IT','Cesena','47521','Centro'),
  ('IT','Lecce','73100','Centro'),('IT','Pesaro','61100','Centro'),
  ('IT','Como','22100','Centro'),('IT','La Spezia','19100','Centro'),
  ('IT','Perugia','06100','Centro'),('IT','Lucca','55100','Centro'),
  ('IT','Pisa','56100','Centro'),('IT','Bolzano','39100','Centro'),
  ('IT','Trento','38100','Centro'),

  -- Spain
  ('ES','Zaragoza','50001','Centro'),('ES','Málaga','29001','Centro'),
  ('ES','Murcia','30001','Centro'),('ES','Palma','07001','Centro'),
  ('ES','Las Palmas','35001','Centro'),('ES','Bilbao','48001','Centro'),
  ('ES','Alicante','03001','Centro'),('ES','Córdoba','14001','Centro'),
  ('ES','Valladolid','47001','Centro'),('ES','Vigo','36201','Centro'),
  ('ES','Gijón','33201','Centro'),('ES','Granada','18001','Centro'),
  ('ES','A Coruña','15001','Centro'),('ES','Vitoria','01001','Centro'),
  ('ES','Santa Cruz de Tenerife','38001','Centro'),('ES','Oviedo','33001','Centro'),
  ('ES','Pamplona','31001','Centro'),('ES','Cartagena','30201','Centro'),
  ('ES','Almería','04001','Centro'),('ES','Castellón','12001','Centro'),
  ('ES','Santander','39001','Centro'),('ES','Burgos','09001','Centro'),
  ('ES','Salamanca','37001','Centro'),('ES','Huelva','21001','Centro'),
  ('ES','Logroño','26001','Centro'),('ES','Badajoz','06001','Centro'),
  ('ES','San Sebastián','20001','Centro'),('ES','León','24001','Centro'),
  ('ES','Tarragona','43001','Centro'),('ES','Cádiz','11001','Centro'),
  ('ES','Jaén','23001','Centro'),('ES','Ourense','32001','Centro'),
  ('ES','Girona','17001','Centro'),

  -- Portugal
  ('PT','Braga','4700-001','Centro'),('PT','Coimbra','3000-001','Centro'),
  ('PT','Funchal','9000-001','Centro'),('PT','Aveiro','3800-001','Centro'),
  ('PT','Faro','8000-001','Centro'),('PT','Viseu','3500-001','Centro'),
  ('PT','Leiria','2400-001','Centro'),('PT','Setúbal','2900-001','Centro'),
  ('PT','Évora','7000-001','Centro'),('PT','Guimarães','4800-001','Centro'),
  ('PT','Viana do Castelo','4900-001','Centro'),('PT','Bragança','5300-001','Centro'),

  -- Netherlands
  ('NL','Eindhoven','5611','Centrum'),('NL','Groningen','9711','Centrum'),
  ('NL','Tilburg','5038','Centrum'),('NL','Almere','1315','Centrum'),
  ('NL','Breda','4811','Centrum'),('NL','Nijmegen','6511','Centrum'),
  ('NL','Apeldoorn','7311','Centrum'),('NL','Haarlem','2011','Centrum'),
  ('NL','Arnhem','6811','Centrum'),('NL','Enschede','7511','Centrum'),
  ('NL','Amersfoort','3811','Centrum'),('NL','Zaanstad','1506','Centrum'),
  ('NL','Zwolle','8011','Centrum'),('NL','Leiden','2311','Centrum'),
  ('NL','Maastricht','6211','Centrum'),('NL','Dordrecht','3311','Centrum'),
  ('NL','Leeuwarden','8911','Centrum'),('NL','Delft','2611','Centrum'),
  ('NL','Alkmaar','1811','Centrum'),

  -- Belgium
  ('BE','Liège','4000','Centre'),('BE','Namur','5000','Centre'),
  ('BE','Mons','7000','Centre'),('BE','Leuven','3000','Centrum'),
  ('BE','Mechelen','2800','Centrum'),('BE','Aalst','9300','Centrum'),
  ('BE','Hasselt','3500','Centrum'),('BE','Kortrijk','8500','Centrum'),
  ('BE','Ostend','8400','Centrum'),('BE','Tournai','7500','Centre'),
  ('BE','Genk','3600','Centrum'),('BE','Roeselare','8800','Centrum'),
  ('BE','Sint-Niklaas','9100','Centrum'),('BE','Charleroi','6000','Centre'),

  -- Luxembourg
  ('LU','Esch-sur-Alzette','4001','Centre'),('LU','Differdange','4501','Centre'),
  ('LU','Dudelange','3401','Centre'),('LU','Ettelbruck','9001','Centre'),

  -- United Kingdom (formats vary)
  ('GB','Birmingham','B1 1AA','City Centre'),('GB','Leeds','LS1 4AP','City Centre'),
  ('GB','Glasgow','G1 1AA','City Centre'),('GB','Liverpool','L1 8JQ','City Centre'),
  ('GB','Newcastle','NE1 7RU','City Centre'),('GB','Sheffield','S1 2HH','City Centre'),
  ('GB','Bristol','BS1 4ST','City Centre'),('GB','Belfast','BT1 5GS','City Centre'),
  ('GB','Leicester','LE1 5WW','City Centre'),('GB','Nottingham','NG1 1AA','City Centre'),
  ('GB','Cardiff','CF10 1BH','City Centre'),('GB','Coventry','CV1 1AA','City Centre'),
  ('GB','Bradford','BD1 1HY','City Centre'),('GB','Stoke-on-Trent','ST1 1AA','City Centre'),
  ('GB','Wolverhampton','WV1 1AA','City Centre'),('GB','Plymouth','PL1 1AA','City Centre'),
  ('GB','Derby','DE1 1AA','City Centre'),('GB','Southampton','SO14 0AA','City Centre'),
  ('GB','Portsmouth','PO1 1AA','City Centre'),('GB','Aberdeen','AB10 1AA','City Centre'),
  ('GB','Brighton','BN1 1AA','City Centre'),('GB','Oxford','OX1 1AA','City Centre'),
  ('GB','Cambridge','CB1 1AA','City Centre'),('GB','York','YO1 7HH','City Centre'),

  -- Ireland
  ('IE','Cork','T12','Centre'),('IE','Galway','H91','Centre'),
  ('IE','Limerick','V94','Centre'),('IE','Waterford','X91','Centre'),
  ('IE','Kilkenny','R95','Centre'),

  -- Poland
  ('PL','Łódź','90-001','Śródmieście'),('PL','Wrocław','50-001','Stare Miasto'),
  ('PL','Poznań','61-001','Stare Miasto'),('PL','Gdańsk','80-001','Śródmieście'),
  ('PL','Szczecin','70-001','Śródmieście'),('PL','Bydgoszcz','85-001','Śródmieście'),
  ('PL','Lublin','20-001','Śródmieście'),('PL','Białystok','15-001','Śródmieście'),
  ('PL','Katowice','40-001','Śródmieście'),('PL','Gdynia','81-001','Śródmieście'),
  ('PL','Częstochowa','42-200','Śródmieście'),('PL','Radom','26-600','Śródmieście'),
  ('PL','Sosnowiec','41-200','Śródmieście'),('PL','Toruń','87-100','Śródmieście'),
  ('PL','Kielce','25-001','Śródmieście'),('PL','Rzeszów','35-001','Śródmieście'),
  ('PL','Gliwice','44-100','Śródmieście'),('PL','Zabrze','41-800','Śródmieście'),
  ('PL','Olsztyn','10-001','Śródmieście'),('PL','Bielsko-Biała','43-300','Śródmieście'),
  ('PL','Opole','45-001','Śródmieście'),('PL','Zielona Góra','65-001','Śródmieście'),
  ('PL','Płock','09-400','Śródmieście'),('PL','Elbląg','82-300','Śródmieście'),

  -- Czech Republic
  ('CZ','Brno','602 00','Centre'),('CZ','Ostrava','702 00','Centre'),
  ('CZ','Plzeň','301 00','Centre'),('CZ','Liberec','460 01','Centre'),
  ('CZ','Olomouc','772 00','Centre'),('CZ','Hradec Králové','500 02','Centre'),
  ('CZ','České Budějovice','370 01','Centre'),('CZ','Pardubice','530 02','Centre'),
  ('CZ','Ústí nad Labem','400 01','Centre'),('CZ','Zlín','760 01','Centre'),
  ('CZ','Karlovy Vary','360 01','Centre'),('CZ','Jihlava','586 01','Centre'),

  -- Slovakia
  ('SK','Košice','040 01','Centre'),('SK','Prešov','080 01','Centre'),
  ('SK','Žilina','010 01','Centre'),('SK','Banská Bystrica','974 01','Centre'),
  ('SK','Nitra','949 01','Centre'),('SK','Trnava','917 01','Centre'),
  ('SK','Trenčín','911 01','Centre'),('SK','Martin','036 01','Centre'),
  ('SK','Poprad','058 01','Centre'),

  -- Hungary
  ('HU','Debrecen','4024','Belváros'),('HU','Szeged','6720','Belváros'),
  ('HU','Miskolc','3525','Belváros'),('HU','Pécs','7621','Belváros'),
  ('HU','Győr','9021','Belváros'),('HU','Nyíregyháza','4400','Belváros'),
  ('HU','Kecskemét','6000','Belváros'),('HU','Székesfehérvár','8000','Belváros'),
  ('HU','Szombathely','9700','Belváros'),('HU','Szolnok','5000','Belváros'),
  ('HU','Tatabánya','2800','Belváros'),('HU','Kaposvár','7400','Belváros'),
  ('HU','Veszprém','8200','Belváros'),('HU','Sopron','9400','Belváros'),

  -- Romania
  ('RO','Cluj-Napoca','400000','Centru'),('RO','Timișoara','300000','Centru'),
  ('RO','Iași','700000','Centru'),('RO','Constanța','900001','Centru'),
  ('RO','Craiova','200000','Centru'),('RO','Brașov','500001','Centru'),
  ('RO','Galați','800001','Centru'),('RO','Ploiești','100000','Centru'),
  ('RO','Oradea','410001','Centru'),('RO','Brăila','810001','Centru'),
  ('RO','Arad','310001','Centru'),('RO','Pitești','110001','Centru'),
  ('RO','Sibiu','550001','Centru'),('RO','Bacău','600001','Centru'),
  ('RO','Târgu Mureș','540001','Centru'),('RO','Baia Mare','430001','Centru'),
  ('RO','Buzău','120001','Centru'),('RO','Botoșani','710001','Centru'),
  ('RO','Satu Mare','440001','Centru'),('RO','Suceava','720001','Centru'),

  -- Greece
  ('GR','Patras','26221','Centre'),('GR','Heraklion','71201','Centre'),
  ('GR','Larissa','41221','Centre'),('GR','Volos','38221','Centre'),
  ('GR','Ioannina','45221','Centre'),('GR','Chania','73131','Centre'),
  ('GR','Kavala','65302','Centre'),('GR','Rhodes','85100','Centre'),
  ('GR','Kalamata','24100','Centre'),('GR','Serres','62122','Centre'),
  ('GR','Alexandroupoli','68131','Centre'),('GR','Trikala','42100','Centre'),
  ('GR','Corfu','49100','Centre'),

  -- Cyprus
  ('CY','Larnaca','6010','Centre'),('CY','Paphos','8010','Centre'),

  -- Malta
  ('MT','Sliema','SLM','Centre'),('MT','St. Julian''s','STJ','Centre'),
  ('MT','Mdina','MDN','Centre'),('MT','Rabat','RBT','Centre'),

  -- Denmark
  ('DK','Odense','5000','Centre'),('DK','Esbjerg','6700','Centre'),
  ('DK','Randers','8900','Centre'),('DK','Kolding','6000','Centre'),
  ('DK','Vejle','7100','Centre'),('DK','Horsens','8700','Centre'),
  ('DK','Helsingør','3000','Centre'),('DK','Roskilde','4000','Centre'),
  ('DK','Herning','7400','Centre'),

  -- Sweden
  ('SE','Uppsala','753 20','Centre'),('SE','Västerås','722 11','Centre'),
  ('SE','Örebro','702 10','Centre'),('SE','Linköping','582 10','Centre'),
  ('SE','Helsingborg','252 20','Centre'),('SE','Jönköping','553 20','Centre'),
  ('SE','Norrköping','602 17','Centre'),('SE','Lund','221 00','Centre'),
  ('SE','Umeå','903 25','Centre'),('SE','Gävle','803 10','Centre'),
  ('SE','Borås','503 30','Centre'),('SE','Eskilstuna','632 20','Centre'),
  ('SE','Halmstad','302 42','Centre'),('SE','Växjö','352 30','Centre'),

  -- Norway
  ('NO','Trondheim','7010','Sentrum'),('NO','Stavanger','4006','Sentrum'),
  ('NO','Kristiansand','4611','Sentrum'),('NO','Drammen','3044','Sentrum'),
  ('NO','Fredrikstad','1606','Sentrum'),('NO','Tromsø','9008','Sentrum'),
  ('NO','Sandnes','4306','Sentrum'),('NO','Bodø','8006','Sentrum'),
  ('NO','Ålesund','6002','Sentrum'),

  -- Finland
  ('FI','Espoo','02100','Keskusta'),('FI','Tampere','33100','Keskusta'),
  ('FI','Vantaa','01300','Keskusta'),('FI','Oulu','90100','Keskusta'),
  ('FI','Turku','20100','Keskusta'),('FI','Jyväskylä','40100','Keskusta'),
  ('FI','Lahti','15110','Keskusta'),('FI','Kuopio','70100','Keskusta'),
  ('FI','Pori','28100','Keskusta'),('FI','Joensuu','80100','Keskusta'),
  ('FI','Rovaniemi','96200','Keskusta'),

  -- Iceland
  ('IS','Kópavogur','200','Centre'),('IS','Hafnarfjörður','220','Centre'),
  ('IS','Akureyri','600','Centre'),

  -- Estonia
  ('EE','Narva','20001','Centre'),('EE','Pärnu','80010','Centre'),
  ('EE','Kohtla-Järve','30321','Centre'),('EE','Viljandi','71004','Centre'),

  -- Latvia
  ('LV','Daugavpils','LV-5401','Centre'),('LV','Liepāja','LV-3401','Centre'),
  ('LV','Jelgava','LV-3001','Centre'),('LV','Jūrmala','LV-2015','Centre'),

  -- Lithuania
  ('LT','Klaipėda','LT-91001','Centre'),('LT','Šiauliai','LT-76001','Centre'),
  ('LT','Panevėžys','LT-35001','Centre'),('LT','Alytus','LT-62001','Centre'),

  -- Ukraine
  ('UA','Kharkiv','61000','Tsentr'),('UA','Dnipro','49000','Tsentr'),
  ('UA','Odesa','65000','Tsentr'),('UA','Zaporizhzhia','69000','Tsentr'),
  ('UA','Kryvyi Rih','50000','Tsentr'),('UA','Mykolaiv','54000','Tsentr'),
  ('UA','Vinnytsia','21000','Tsentr'),('UA','Poltava','36000','Tsentr'),
  ('UA','Chernihiv','14000','Tsentr'),('UA','Cherkasy','18000','Tsentr'),
  ('UA','Khmelnytskyi','29000','Tsentr'),('UA','Zhytomyr','10000','Tsentr'),
  ('UA','Sumy','40000','Tsentr'),('UA','Rivne','33000','Tsentr'),
  ('UA','Ivano-Frankivsk','76000','Tsentr'),('UA','Ternopil','46000','Tsentr'),
  ('UA','Uzhhorod','88000','Tsentr'),

  -- Moldova
  ('MD','Bălți','3100','Centru'),('MD','Cahul','3901','Centru'),
  ('MD','Tiraspol','3300','Centru'),('MD','Ungheni','3601','Centru'),
  ('MD','Orhei','3501','Centru'),('MD','Soroca','3001','Centru'),

  -- Belarus
  ('BY','Brest','224000','Centr'),('BY','Gomel','246000','Centr'),
  ('BY','Vitebsk','210000','Centr'),('BY','Grodno','230000','Centr'),

  -- Russia
  ('RU','Novosibirsk','630000','Tsentr'),('RU','Yekaterinburg','620000','Tsentr'),
  ('RU','Nizhny Novgorod','603000','Tsentr'),('RU','Samara','443000','Tsentr'),
  ('RU','Kazan','420000','Tsentr'),('RU','Chelyabinsk','454000','Tsentr'),
  ('RU','Rostov-on-Don','344000','Tsentr'),('RU','Ufa','450000','Tsentr'),
  ('RU','Volgograd','400000','Tsentr'),('RU','Perm','614000','Tsentr'),
  ('RU','Krasnodar','350000','Tsentr'),('RU','Yaroslavl','150000','Tsentr'),
  ('RU','Kaliningrad','236000','Tsentr'),

  -- Turkey
  ('TR','Ankara','06000','Merkez'),('TR','Izmir','35000','Merkez'),
  ('TR','Bursa','16000','Merkez'),('TR','Adana','01000','Merkez'),
  ('TR','Gaziantep','27000','Merkez'),('TR','Konya','42000','Merkez'),
  ('TR','Antalya','07000','Merkez'),('TR','Kayseri','38000','Merkez'),
  ('TR','Mersin','33000','Merkez'),('TR','Eskişehir','26000','Merkez'),
  ('TR','Diyarbakır','21000','Merkez'),('TR','Samsun','55000','Merkez'),
  ('TR','Denizli','20000','Merkez'),('TR','Trabzon','61000','Merkez'),
  ('TR','Erzurum','25000','Merkez'),('TR','Edirne','22000','Merkez')
) AS v(country_code, city_name, code, area_name)
JOIN countries c ON upper(c.code) = upper(v.country_code)
JOIN cities ci ON ci.country_id = c.id AND lower(ci.name) = lower(v.city_name)
WHERE NOT EXISTS (
  SELECT 1 FROM postal_codes p
  WHERE p.city_id = ci.id AND p.code = v.code
);
