/*
  # Seed Support FAQs - Greetings, Thanks, and Conversational Responses

  Adds 50 FAQ entries for:
  - Greetings and welcome messages
  - Thank you responses
  - Farewell messages
  - General conversational patterns
*/

INSERT INTO support_faqs (category, question, answer, keywords, priority) VALUES

-- PERSHENDETJE (Greetings) - 20 entries
('Pershendetje', 'Pershendetje', 'Pershendetje! Miresevini ne suportin e EuroPallet. Si mund t''ju ndihmoj sot? Mund te me pyesni per cdo gje qe lidhet me platformen.', ARRAY['pershendetje', 'tungjatjeta', 'miremengjesi', 'miredita', 'mirembrema', 'ckemi', 'hej', 'hello', 'hi'], 10),
('Pershendetje', 'Miremengjesi', 'Miremengjesi! Shpresoj te keni nje dite te mbare. Si mund t''ju ndihmoj me platformen EuroPallet sot?', ARRAY['miremengjesi', 'mengjesi', 'mengjes'], 10),
('Pershendetje', 'Miredita', 'Miredita! Jam ketu per t''ju ndihmuar. Cfare pyetjeje keni per platformen?', ARRAY['miredita', 'dita', 'ditenmire'], 10),
('Pershendetje', 'Mirembrema', 'Mirembrema! Edhe pse eshte vone, jam ketu per t''ju ndihmuar. Me cfare mund t''ju sherbej?', ARRAY['mirembrema', 'mbrema', 'darke', 'nate'], 10),
('Pershendetje', 'Ckemi', 'Ckemi! Miresevini ne suportin e EuroPallet. Me tregoni se si mund t''ju ndihmoj?', ARRAY['ckemi', 'cke', 'cka', 'tungjatjeta'], 10),
('Pershendetje', 'Si jeni?', 'Jam mire, faleminderit qe pyetni! Jam gjithmone gati per t''ju ndihmuar. Cfare mund te bej per ju sot?', ARRAY['jeni', 'mire', 'shendeti', 'gjendja'], 8),
('Pershendetje', 'A ka njeri ketu?', 'Po, jam ketu! Une jam asistenti virtual i EuroPallet dhe jam i disponueshem 24/7. Si mund t''ju ndihmoj?', ARRAY['njeri', 'ketu', 'dikush', 'ndokush', 'prezent'], 8),
('Pershendetje', 'Kam nevoje per ndihme', 'Sigurisht, jam ketu pikerisht per kete! Tregoni me cfare problemi ose pyetjeje keni dhe do te bej cmos per t''ju ndihmuar.', ARRAY['nevoje', 'ndihme', 'ndihmoj', 'help', 'asistence', 'duhet'], 10),
('Pershendetje', 'Mund te me ndihmoni?', 'Sigurisht qe po! Jam ketu per t''ju ndihmuar me cdo pyetje rreth platformes EuroPallet. Cfare ju nevojitet?', ARRAY['ndihmoni', 'ndihmosh', 'ndihmo', 'mundesh', 'lutemi'], 10),
('Pershendetje', 'Dua te pyes dicka', 'Natyrisht! Pyesni lirisht cfaredo qe ju intereson rreth platformes. Jam ketu per t''ju pergjigju.', ARRAY['dua', 'pyes', 'pyetje', 'dicka', 'informacion'], 9),
('Pershendetje', 'Hej', 'Hej! Si mund t''ju ndihmoj sot? Mund te me pyesni per llogarine, stokun, dergesat, dokumentet, ose cdo gje tjeter.', ARRAY['hej', 'hei', 'hey', 'ej', 'ore'], 10),
('Pershendetje', 'Cfare mund te besh per mua?', 'Mund t''ju ndihmoj me shume gjera: pyetje per llogarine, stokun, dergesat, dokumentet, pagesat, probleme teknike, dhe me shume. Thjesht pyesni!', ARRAY['cfare', 'besh', 'mundesh', 'ofrosh', 'ndihmosh'], 9),
('Pershendetje', 'Kam nje pyetje', 'Me pelqen t''ju ndihmoj! Beni pyetjen tuaj dhe do te provoj te gjej pergjigjen me te mire per ju.', ARRAY['pyetje', 'kam', 'dua', 'kerkoj'], 9),
('Pershendetje', 'A je robot?', 'Po, jam nje asistent virtual i programuar per t''ju ndihmuar me pyetjet me te shpeshta rreth platformes EuroPallet. Per probleme me komplekse, ekipi yne i suportit do te pergjigjet personalisht.', ARRAY['robot', 'bot', 'njeri', 'makine', 'automatik', 'artificial'], 7),
('Pershendetje', 'Kush je ti?', 'Une jam asistenti virtual i suportit te EuroPallet. Jam ketu 24/7 per t''ju ndihmuar me pyetje rreth platformes. Per cfare ju nevojitet ndihme?', ARRAY['kush', 'je', 'emri', 'kend'], 7),
('Pershendetje', 'Po, kam nje problem', 'Me vjen keq qe keni hasur ne problem. Pershkruani problemin tuaj sa me qarte qe te mundemi t''ju ndihmojme sa me shpejt.', ARRAY['problem', 'kam', 'gabim', 'nuk', 'funksionon'], 9),
('Pershendetje', 'Me duhet ndihme urgjente', 'E kuptoj qe eshte urgjente! Pershkruani problemin tuaj dhe do te provoj t''ju ndihmoj menjehere. Nese nevojitet nderhyrje manuale, ekipi yne do te njoftohet.', ARRAY['urgjent', 'urgjente', 'shpejt', 'menjehere', 'ngut', 'emergjenc'], 10),
('Pershendetje', 'Filloj tani', 'Shkelqyer! Jam gati t''ju ndihmoj. Cfare deshironi te dini ose cfare problemi keni hasur?', ARRAY['filloj', 'tani', 'gati', 'nisem'], 8),
('Pershendetje', 'A punon suporti?', 'Po, suporti virtual eshte aktiv 24/7! Mund te me pyesni kudo kohe. Per pergjigje nga ekipi yne, koha e pritjes eshte zakonisht disa ore.', ARRAY['punon', 'suport', 'aktiv', 'hapur', 'orar', 'disponueshem'], 8),
('Pershendetje', 'Dua te di dicka', 'Sigurisht! Me tregoni se cfare deshironi te dini dhe do te bej cmos per t''ju dhene nje pergjigje te sakte.', ARRAY['dua', 'di', 'dicka', 'informacion', 'mesoj'], 8),

-- FALENDERIME (Thank you responses) - 20 entries
('Falenderime', 'Faleminderit', 'Nuk ka perSe! Eshte kenaqesi t''ju ndihmoj. Nese keni pyetje te tjera ne te ardhmen, mos hezitoni te na kontaktoni perseri.', ARRAY['faleminderit', 'fala', 'rrofsh', 'nderit', 'thanks', 'thank'], 10),
('Falenderime', 'Shume faleminderit', 'Ju lutem, eshte detyra jone! Gezohemi qe mundemi t''ju ndihmojme. Nese keni nevoje per ndihme te metejshme, jemi gjithmone ketu.', ARRAY['shume', 'faleminderit', 'fala', 'thanks', 'thank'], 10),
('Falenderime', 'Rrofsh', 'Faleminderit per fjalet e mira! Nese keni dicka tjeter, mos ngurroni te pyesni. Jemi ketu per ju!', ARRAY['rrofsh', 'rrof', 'rrofsha', 'bravo'], 10),
('Falenderime', 'Faleminderit per ndihmen', 'Me kenaqesi! Shpresoj qe pergjigja ishte e dobishme. Mos hezitoni te ktheheni nese keni pyetje te tjera.', ARRAY['faleminderit', 'ndihme', 'ndihmuat', 'ndihmove'], 10),
('Falenderime', 'Ishte shume e dobishme', 'Gezohemi qe ju ndihmuam! Misioni yne eshte t''ju bejme perdorimin e platformes sa me te lehte. Kthehuni kurdo qe keni nevoje.', ARRAY['dobishme', 'ndihmoi', 'mire', 'shkelqyer', 'perfekte'], 9),
('Falenderime', 'E mora pergjigjen, faleminderit', 'Shkelqyer! Gezohemi qe gjetet pergjigjen. Nese hasni ne ndonje problem tjeter, jemi vetem nje mesazh larg.', ARRAY['mora', 'pergjigje', 'kuptova', 'mire', 'faleminderit'], 9),
('Falenderime', 'Bravo, funksionoi', 'Lajm i mire! Gezohemi qe u zgjidh problemi. Nese keni nevoje per ndihme ne te ardhmen, na shkruani kurdo.', ARRAY['bravo', 'funksionoi', 'punoi', 'zgjidhi', 'sukses'], 9),
('Falenderime', 'E zgjidha, faleminderit', 'Perfekte! Eshte kenaqesi qe mundemi t''ju ndihmojme ta zgjidhni. Suksese me punen tuaj ne platforme!', ARRAY['zgjidha', 'zgjidhur', 'rregullova', 'funksionon', 'tani'], 9),
('Falenderime', 'Jeni te mrekullueshem', 'Faleminderit per fjalet e ngrohta! Ekipi yne punon cdo dite per t''ju ofruar sherbimin me te mire. Nese keni nevoje, na shkruani!', ARRAY['mrekullueshem', 'fantastik', 'te mire', 'shkelqyer'], 8),
('Falenderime', 'Ndihmuat shume', 'Kenaqesi e jona! Qellimi yne eshte qe cdo perdorues te kete pervoje te shkelqyer. Mos ngurroni te na kontaktoni perseri.', ARRAY['ndihmuat', 'shume', 'dobishem', 'ndihmove', 'ndihme'], 9),
('Falenderime', 'OK faleminderit', 'Nuk ka perSe! Suksese dhe nese keni pyetje te tjera, jemi ketu per ju.', ARRAY['ok', 'faleminderit', 'dakord', 'mire'], 9),
('Falenderime', 'Perfekte, faleminderit', 'Me kenaqesi! Nese ka dicka tjeter qe mund te bejme per ju, mos ngurroni te na shkruani.', ARRAY['perfekte', 'shkelqyer', 'mire', 'faleminderit'], 9),
('Falenderime', 'Ju falenderoj shume', 'Eshte kenaqesia jone! Platforma EuroPallet eshte ketu per t''ju lehtesuar punen. Suksese!', ARRAY['falenderoj', 'shume', 'nderit', 'respekt'], 9),
('Falenderime', 'Tani e kuptova', 'Shkelqyer! Eshte e rendesishme te kuptoni se si funksionon platforma. Nese keni pyetje te tjera ne te ardhmen, jemi ketu.', ARRAY['kuptova', 'kuptoj', 'qarte', 'tani', 'e di'], 8),
('Falenderime', 'Super, faleminderit', 'Faleminderit! Gezohemi qe mundemi t''ju ndihmojme. Puna juaj eshte e rendesishme per ne. Suksese!', ARRAY['super', 'faleminderit', 'top', 'mire'], 9),
('Falenderime', 'U zgjidh problemi', 'Lajm fantastik! Ne gezohemi kur problemet zgjidhen shpejt. Nese hasni ne probleme te tjera, jemi gjithmone ketu per ju.', ARRAY['zgjidh', 'problemi', 'rregullua', 'funksionon'], 9),
('Falenderime', 'Dakord, e kuptova', 'Shume mire! Nese dicka nuk eshte e qarte me vone, mos ngurroni te na pyesni perseri. Jemi ketu 24/7.', ARRAY['dakord', 'kuptova', 'mire', 'ne rregull', 'ok'], 8),
('Falenderime', 'Mire, faleminderit shume', 'Ju lutem! Shpresojme qe pervoja juaj me EuroPallet te jete gjithmone pozitive. Na kontaktoni kurdo qe keni nevoje!', ARRAY['mire', 'faleminderit', 'shume', 'dakord'], 9),
('Falenderime', 'Ndihme e shkelqyer', 'Faleminderit per vleresimin! Punojme fort per te ofruar suportin me te mire. Kthehuni kurdo qe ju nevojitet ndihme.', ARRAY['ndihme', 'shkelqyer', 'mire', 'fantastike', 'mrekullueshem'], 8),
('Falenderime', 'Do te kthehem nese kam nevoje', 'Sigurisht! Jemi gjithmone ketu per ju. Mos ngurroni te na shkruani per cdo pyetje ose problem. Dite te mbare!', ARRAY['kthehem', 'nevoje', 'perseri', 'tjeter', 'here'], 8),

-- LAMTUMIRE (Farewell) - 10 entries
('Lamtumire', 'Mirupafshim', 'Mirupafshim! Shpresoj t''ju kem ndihmuar. Kthehuni kurdo qe keni nevoje. Dite te mbare!', ARRAY['mirupafshim', 'lamtumire', 'shihemi', 'tung', 'ciao', 'bye'], 9),
('Lamtumire', 'Naten e mire', 'Naten e mire! Shpresojme qe dita juaj ishte produktive. Nese keni nevoje per ndihme neser, jemi ketu. Flini mire!', ARRAY['naten', 'mire', 'nate', 'gjithe', 'flutur'], 9),
('Lamtumire', 'Shihemi', 'Shihemi! Ishte kenaqesi t''ju ndihmoja. Suksese me punen tuaj dhe mos ngurroni te na kontaktoni perseri!', ARRAY['shihemi', 'heret', 'here', 'tjeter'], 9),
('Lamtumire', 'Tung', 'Tung! Dite te mbare dhe suksese me punen. Jemi gjithmone ketu nese keni nevoje!', ARRAY['tung', 'ciao', 'bye', 'shihemi'], 9),
('Lamtumire', 'Dite te mbare', 'Faleminderit, gjithashtu! Shpresoj te keni nje dite te shkelqyer. Na kontaktoni kurdo qe keni nevoje per ndihme.', ARRAY['dite', 'mbare', 'mire', 'bukur', 'shkelqyer'], 8),
('Lamtumire', 'Mbylleni tiketin', 'Sigurisht! Po e mbyll tiketin. Nese keni nevoje per ndihme ne te ardhmen, hapni nje bisede te re. Suksese!', ARRAY['mbyll', 'tiketin', 'mbylle', 'perfundo', 'mbaro'], 8),
('Lamtumire', 'Nuk kam pyetje te tjera', 'Shkelqyer! Gezohemi qe u pergjigjem te gjitha pyetjeve tuaja. Kthehuni kurdo qe keni nevoje. Dite te mbare!', ARRAY['nuk', 'pyetje', 'tjera', 'mjaft', 'gjithe'], 8),
('Lamtumire', 'Kaq ishte', 'Perfekte! Nese ka dicka tjeter ne te ardhmen, jemi vetem nje mesazh larg. Suksese me punen!', ARRAY['kaq', 'ishte', 'mjaft', 'gjithe', 'perfundova'], 8),
('Lamtumire', 'Faleminderit, mirupafshim', 'Mirupafshim dhe suksese! Ishte kenaqesi t''ju ndihmoja. Na shkruani kurdo qe keni pyetje. Dite te mbare!', ARRAY['faleminderit', 'mirupafshim', 'lamtumire', 'bye'], 10),
('Lamtumire', 'Suksese', 'Faleminderit, gjithashtu suksese! Shpresojme qe platforma t''ju lehtesoje punen cdo dite. Jemi ketu per ju!', ARRAY['suksese', 'sukses', 'fat', 'mbare'], 8);
