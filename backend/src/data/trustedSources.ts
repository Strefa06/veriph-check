export type TrustedSource = {
  name: string;
  domain: string;
  category: "government" | "news" | "fact-check";
  trustWeight: number;
};

export const trustedPhilippineSources: TrustedSource[] = [
  { name: "Official Gazette", domain: "officialgazette.gov.ph", category: "government", trustWeight: 1.0 },
  { name: "Department of Health", domain: "doh.gov.ph", category: "government", trustWeight: 0.98 },
  { name: "Philippine Statistics Authority", domain: "psa.gov.ph", category: "government", trustWeight: 0.98 },
  { name: "Department of Science and Technology", domain: "dost.gov.ph", category: "government", trustWeight: 0.96 },
  { name: "Philippine News Agency", domain: "pna.gov.ph", category: "government", trustWeight: 0.94 },
  { name: "COMELEC", domain: "comelec.gov.ph", category: "government", trustWeight: 0.95 },
  { name: "NEDA", domain: "neda.gov.ph", category: "government", trustWeight: 0.95 },
  { name: "BSP", domain: "bsp.gov.ph", category: "government", trustWeight: 0.95 },
  { name: "VERA Files", domain: "verafiles.org", category: "fact-check", trustWeight: 0.94 },
  { name: "Rappler", domain: "rappler.com", category: "fact-check", trustWeight: 0.9 },
  { name: "FactsFirstPH", domain: "factsfirst.ph", category: "fact-check", trustWeight: 0.9 },
  { name: "Tsek.ph", domain: "tsek.ph", category: "fact-check", trustWeight: 0.9 },
  { name: "PressOne PH", domain: "pressone.ph", category: "news", trustWeight: 0.84 },
  { name: "Philippine Star", domain: "philstar.com", category: "news", trustWeight: 0.86 },
  { name: "Inquirer.net", domain: "inquirer.net", category: "news", trustWeight: 0.84 },
  { name: "ABS-CBN", domain: "abs-cbn.com", category: "news", trustWeight: 0.86 },
  { name: "ABS-CBN News", domain: "news.abs-cbn.com", category: "news", trustWeight: 0.86 },
  { name: "GMA News", domain: "gmanetwork.com", category: "news", trustWeight: 0.86 },
  { name: "GMA Integrated News", domain: "gmanews.tv", category: "news", trustWeight: 0.86 },
  { name: "Manila Bulletin", domain: "mb.com.ph", category: "news", trustWeight: 0.83 },
  { name: "The Manila Times", domain: "manilatimes.net", category: "news", trustWeight: 0.82 },
  { name: "BusinessWorld", domain: "bworldonline.com", category: "news", trustWeight: 0.83 },
  { name: "News5", domain: "news5.com.ph", category: "news", trustWeight: 0.82 },
  { name: "SunStar", domain: "sunstar.com.ph", category: "news", trustWeight: 0.8 },
  { name: "MindaNews", domain: "mindanews.com", category: "news", trustWeight: 0.8 },
  { name: "CNN Philippines", domain: "cnnphilippines.com", category: "news", trustWeight: 0.82 }
];
