export default {
  async createFont(pictureAry) {
    const response = await fetch(`/api/create_font`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pictures: pictureAry })
    })
    return response.json()
  }
}
