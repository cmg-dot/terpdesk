import { fetchInterpreterOffers } from "../src/app/actions/getInterpreterOffers";
async function test() {
  const offers = await fetchInterpreterOffers('interpreter@example.com');
  console.log(JSON.stringify(offers, null, 2));
}
test();
